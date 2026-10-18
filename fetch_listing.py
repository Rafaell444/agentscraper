"""Fetch one listing by URL and save it to the CRM database.

The CRM runs this (through the fetch-listing GitHub workflow) when an agent
imports a MyHome link that the collector has not picked up yet: MyHome does
not let the CRM's own server read its pages, the collector's client can.

    python fetch_listing.py https://www.myhome.ge/udzravi-qoneba/...-24256700/
"""

from __future__ import annotations

import argparse
import logging
import sys
from urllib.parse import urlparse

import storage
from sites import myhome
from sites.common import LOGGER, build_session, now_iso, phones_in_text

ADAPTERS = {"myhome.ge": myhome}


def adapter_for(url: str):
    host = (urlparse(url).hostname or "").removeprefix("www.")
    return ADAPTERS.get(host)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("url")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    site = adapter_for(args.url)
    if site is None:
        LOGGER.error("No single-listing fetcher for %s", args.url)
        return 2
    row = site.fetch_one(build_session(), args.url)
    if not row.get("Phone Number"):
        row["Phone Number"] = phones_in_text(row.get("Description"))
    # Keep what the collector already knows (phone found by hand, first-seen time).
    known = storage.load_rows(site.KEY, include_archived=True).get(row["Property ID"])
    if known:
        storage.merge_row(known, row)
        row = known
    else:
        row["Timestamp Added"] = now_iso()
    storage.save_one(site.KEY, row)
    LOGGER.info("Saved %s:%s %s", site.KEY, row["Property ID"], row.get("Title"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
