"""Match newly collected listings against open client requests and alert agents.

Runs in the cloud right after the collector.  For every client who is still
searching, listings collected since the last run that fit the client's
request (deal type, budget, minimum rooms, areas) are:

* added to the client's shortlist as ``proposed`` with the note ``auto``,
* written as a CRM notification for the assigned agent (bell icon),
* sent to the agent's Telegram if they have a chat id (TELEGRAM_BOT_TOKEN).
"""

from __future__ import annotations

import argparse
import logging
import os
import uuid
from datetime import datetime, timedelta

import requests

import storage

LOGGER = logging.getLogger("notify")
OPEN_STATUSES = ("new", "searching", "viewing")


def cuid() -> str:
    return "c" + uuid.uuid4().hex[:24]


def send_telegram(token: str, chat_id: str, text: str) -> None:
    requests.post(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data={"chat_id": chat_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True},
        timeout=30,
    ).raise_for_status()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL", ""))
    parser.add_argument("--since-minutes", type=int, default=int(os.getenv("NOTIFY_SINCE_MINUTES", "45")))
    parser.add_argument("--base-url", default=os.getenv("CRM_BASE_URL", ""))
    parser.add_argument("--log-level", default=os.getenv("LOG_LEVEL", "INFO"))
    args = parser.parse_args()
    logging.basicConfig(level=getattr(logging, args.log_level.upper(), logging.INFO), format="%(asctime)s %(levelname)s %(message)s")
    if not args.database_url:
        LOGGER.error("DATABASE_URL is required")
        return 1
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    db = storage.Database(args.database_url)
    try:
        base_url = args.base_url or db.execute('SELECT "value" FROM "settings" WHERE "key" = ?', ("public_base_url",)).fetchone()
        base_url = (base_url[0] if isinstance(base_url, tuple) else base_url or "").rstrip("/")
        since = db.date_value(datetime.now() - timedelta(minutes=args.since_minutes))
        clients = db.execute(
            'SELECT c."id", c."name", c."deal_type", c."budget_min", c."budget_max", c."rooms_min", c."areas", c."assigned_to_id", u."telegram_chat_id" '
            'FROM "clients" c LEFT JOIN "users" u ON u."id" = c."assigned_to_id" WHERE c."status" IN (?, ?, ?)',
            OPEN_STATUSES,
        ).fetchall()
        fresh = db.execute(
            'SELECT "id", "title", "deal_type", "price_usd", "rooms", "neighbourhood", "district", "area_m2", "poster_kind" '
            'FROM "listings" WHERE "archived" = ? AND "collected_at" >= ?',
            (db.bool_value(False), since),
        ).fetchall()
        LOGGER.info("open clients=%s fresh listings=%s", len(clients), len(fresh))
        created = 0
        for client_id, name, deal, bmin, bmax, rooms_min, areas, agent_id, chat_id in clients:
            wanted_areas = [a.strip() for a in (areas or "").replace(";", ",").split(",") if a.strip()]
            matches = []
            for lid, title, ldeal, price, rooms, nb, district, area, kind in fresh:
                if deal and ldeal != deal:
                    continue
                if price is not None and ((bmin is not None and price < bmin) or (bmax is not None and price > bmax)):
                    continue
                if rooms_min and (rooms is None or rooms < rooms_min):
                    continue
                if wanted_areas and not ((nb and nb in wanted_areas) or (district and district in wanted_areas)):
                    continue
                exists = db.execute('SELECT 1 FROM "shortlists" WHERE "client_id" = ? AND "listing_id" = ?', (client_id, lid)).fetchone()
                if exists:
                    continue
                matches.append((lid, title, price, rooms, nb or district, kind))
            if not matches:
                continue
            now = db.date_value(datetime.now())
            for lid, *_ in matches:
                db.execute(
                    'INSERT INTO "shortlists" ("id", "client_id", "listing_id", "status", "note", "created_at") VALUES (?, ?, ?, ?, ?, ?)',
                    (cuid(), client_id, lid, "proposed", "auto", now),
                )
            lines = [f"• {t or lid} — {'$' + format(int(p), ',') if p else '—'}, {r or '?'} ოთ., {nb or ''}{' (მესაკუთრე)' if k == 'owner' else ''}" for lid, t, p, r, nb, k in matches[:8]]
            body = "\n".join(lines) + (f"\n… კიდევ {len(matches) - 8}" if len(matches) > 8 else "")
            link = f"/clients/{client_id}"
            if agent_id:
                db.execute(
                    'INSERT INTO "notifications" ("id", "user_id", "type", "title", "body", "link", "created_at") VALUES (?, ?, ?, ?, ?, ?, ?)',
                    (cuid(), agent_id, "match", f"{name}: {len(matches)} ახალი შესაფერისი განცხადება", body, link, now),
                )
                created += 1
                if token and chat_id:
                    try:
                        send_telegram(token, chat_id, f"<b>{name}</b>: {len(matches)} ახალი შესაფერისი განცხადება\n{body}\n{base_url}{link}" if base_url else f"<b>{name}</b>: {len(matches)} ახალი შესაფერისი განცხადება\n{body}")
                    except Exception as exc:  # Telegram failure must not stop the run
                        LOGGER.warning("telegram to %s failed: %s", agent_id, exc)
        db.commit()
        LOGGER.info("notifications created=%s", created)
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
