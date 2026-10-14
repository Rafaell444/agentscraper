"""Collect every listing from each configured site into ``data/<site>.csv``.

Nothing is filtered on the websites: each adapter reads the site's full feed
ordered newest first.  The first run for a site backfills up to
``BACKFILL_PAGES`` result pages; later runs read ``DELTA_PAGES`` pages (and
stop early once two consecutive pages contain nothing new), so every new or
bumped listing is captured twice an hour.  Sites whose list cards lack the
phone number or owner type then read up to ``DETAIL_LIMIT`` detail pages per
run, newest first.  Per-site overrides use the site key as a prefix, for
example ``SSGE_DETAIL_LIMIT`` or ``PLACE_BACKFILL_PAGES``.

Filtering (district, price, owner-only, ...) is done in Excel.
"""

from __future__ import annotations

import argparse
import logging
import os
from types import ModuleType
from typing import Any

import requests

import build_workbook
import storage
from sites import SITE_KEYS, load_site
from sites.common import (
    FILTER_CITY,
    LOGGER,
    MAX_AGE_DAYS,
    OWNER_PHYSICAL,
    OWNERS_ONLY,
    ScraperError,
    build_session,
    city_matches,
    env_int,
    is_newly_added,
    is_recent,
    now_iso,
    phones_in_text,
    polite_pause,
    set_current_site,
)

CHECKPOINT_PAGES = 25
LEGACY_STATUS = "legacy"


def setting(site: ModuleType, name: str, default: int) -> int:
    return env_int(f"{site.KEY.upper()}_{name}", env_int(name, default))


def in_scope(site: ModuleType, row: dict[str, Any]) -> bool:
    """Apply the city / owners-only scope to one row.

    A row whose owner type is still unknown is kept only while a detail
    fetch can still resolve it; once the detail page has been read (or the
    site has no detail page) an unknown poster is treated as not an owner.
    Rows imported from the earlier monitor (``Detail Status`` = ``legacy``)
    are always kept.
    """
    if row.get("Detail Status") == LEGACY_STATUS:
        return True
    if FILTER_CITY and not city_matches(row.get("City")):
        return False
    if not is_recent(row):
        return False
    can_resolve = site.needs_detail(row) and row.get("Detail Status") != "failed"
    newly_added = is_newly_added(row)
    if newly_added is False or (newly_added is None and not can_resolve):
        return False
    if not OWNERS_ONLY:
        return True
    owner_type = str(row.get("Owner Type") or "")
    if owner_type == OWNER_PHYSICAL:
        return True
    if owner_type:
        return False
    return can_resolve


def scoped(site: ModuleType, rows: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {key: row for key, row in rows.items() if in_scope(site, row)}


def collect_site(session: requests.Session, site: ModuleType, args: argparse.Namespace) -> dict[str, int]:
    set_current_site(site.KEY, getattr(site, "REQUEST_DELAY", None))
    rows = storage.load_rows(site.KEY)
    # --backfill resumes a deep crawl whose checkpoints already exist.
    backfill = not rows or args.backfill
    if backfill:
        max_pages = args.backfill_pages or setting(site, "BACKFILL_PAGES", 50)
    else:
        max_pages = args.delta_pages or setting(site, "DELTA_PAGES", 10)

    stats = {"pages": 0, "new": 0, "updated": 0, "details": 0, "detail_failures": 0}
    previous_fingerprint: tuple[str, ...] | None = None
    stale_pages = 0
    for page in range(1, max_pages + 1):
        if page > 1:
            polite_pause()
        try:
            page_rows = site.parse_list(session, page)
        except (requests.RequestException, ScraperError) as exc:
            LOGGER.error("[%s] page %s failed: %s", site.KEY, page, exc)
            break
        if not page_rows:
            LOGGER.info("[%s] pagination ended at empty page %s", site.KEY, page)
            break
        stats["pages"] += 1
        fingerprint = tuple(row["Property ID"] for row in page_rows)
        if fingerprint == previous_fingerprint:
            LOGGER.warning("[%s] page %s repeated the previous page; stopping", site.KEY, page)
            break
        previous_fingerprint = fingerprint

        if backfill and page_rows and not any(is_recent(row) for row in page_rows):
            LOGGER.info("[%s] page %s is older than %s days; stopping", site.KEY, page, MAX_AGE_DAYS)
            break
        new_on_page = 0
        for row in page_rows:
            property_id = row["Property ID"]
            if not property_id:
                continue
            if property_id not in rows:
                row["Timestamp Added"] = now_iso()
            if not in_scope(site, row):
                continue
            # Owners often write their number in the text; use it when the
            # site itself masks the phone (MyHome) or has not been read yet.
            if not row.get("Phone Number"):
                row["Phone Number"] = phones_in_text(row.get("Description"))
            if property_id in rows:
                if storage.merge_row(rows[property_id], row):
                    stats["updated"] += 1
            else:
                rows[property_id] = row
                new_on_page += 1
        stats["new"] += new_on_page
        LOGGER.info(
            "[%s] %s page %s: %s listings, %s new",
            site.KEY, "backfill" if backfill else "delta", page, len(page_rows), new_on_page,
        )
        if not backfill:
            stale_pages = 0 if new_on_page else stale_pages + 1
            if stale_pages >= 2:
                break
        elif page % CHECKPOINT_PAGES == 0 and rows:
            # Long backfills save progress so an interrupted run keeps its work.
            storage.save_rows(site.KEY, scoped(site, rows))

    if not args.no_details:
        limit = args.detail_limit if args.detail_limit is not None else setting(site, "DETAIL_LIMIT", 150)
        pending = [
            row for row in rows.values()
            if site.needs_detail(row) and row.get("Detail Status") != LEGACY_STATUS
        ]
        # Newest first; owner posts before agents' (phones matter most there);
        # rows whose earlier detail fetch failed come last.
        kind_rank = {OWNER_PHYSICAL: 0, "": 1}
        pending.sort(key=lambda row: row.get("Timestamp Added", ""), reverse=True)
        pending.sort(key=lambda row: kind_rank.get(str(row.get("Owner Type") or ""), 2))
        pending.sort(key=lambda row: row.get("Detail Status") == "failed")
        for index, row in enumerate(pending[:limit], 1):
            try:
                update = site.fetch_detail(session, row)
            except (requests.RequestException, ScraperError, KeyError, ValueError) as exc:
                row["Detail Status"] = "failed"
                stats["detail_failures"] += 1
                LOGGER.warning("[%s] detail %s failed: %s", site.KEY, row["Property ID"], exc)
                continue
            storage.merge_row(row, update)
            row["Detail Status"] = "done"
            stats["details"] += 1
            if index % 100 == 0:
                storage.save_rows(site.KEY, scoped(site, rows))
                LOGGER.info("[%s] detail progress %s/%s", site.KEY, index, min(limit, len(pending)))

    # Detail pages may have revealed agents or other cities; drop those now.
    before = len(rows)
    rows = scoped(site, rows)
    stats["dropped"] = before - len(rows)
    # A run that collected nothing (site down, rate limited) must not write an
    # empty file, otherwise the next run would not know to backfill.
    changed = storage.save_rows(site.KEY, rows) if rows else False
    stats["total"] = len(rows)
    stats["changed"] = int(changed)
    LOGGER.info(
        "[%s] mode=%s pages=%s new=%s updated=%s details=%s detail_failures=%s dropped=%s total=%s changed=%s",
        site.KEY, "backfill" if backfill else "delta", stats["pages"], stats["new"], stats["updated"],
        stats["details"], stats["detail_failures"], stats["dropped"], stats["total"], bool(changed),
    )
    return stats


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sites", default=os.getenv("SITES", ""), help="comma-separated site keys (default: all)")
    parser.add_argument("--backfill-pages", type=int, default=None)
    parser.add_argument("--backfill", action="store_true", help="read backfill pages even when data already exists")
    parser.add_argument("--delta-pages", type=int, default=None)
    parser.add_argument("--detail-limit", type=int, default=None)
    parser.add_argument("--no-details", action="store_true", help="skip detail-page enrichment")
    parser.add_argument("--no-workbook", action="store_true", help="do not rebuild properties.xlsx")
    parser.add_argument("--output", default="properties.xlsx")
    parser.add_argument("--log-level", default=os.getenv("LOG_LEVEL", "INFO"))
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(
        level=getattr(logging, str(args.log_level).upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
    )
    keys = [key.strip() for key in args.sites.split(",") if key.strip()] or list(SITE_KEYS)
    sites = [load_site(key) for key in keys]
    failures = 0
    any_changed = False
    with build_session() as session:
        for site in sites:
            try:
                stats = collect_site(session, site, args)
                any_changed = any_changed or bool(stats["changed"])
            except Exception as exc:  # one broken site must not stop the others
                failures += 1
                LOGGER.exception("[%s] collection failed: %s", site.KEY, exc)
    if not args.no_workbook and (any_changed or not os.path.exists(args.output)):
        build_workbook.build(args.output)
    if sites and failures == len(sites):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
