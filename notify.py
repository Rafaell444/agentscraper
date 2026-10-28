"""Match newly collected listings against open client requests and alert agents.

Runs in the cloud right after the collector.  For every client who is still
searching, listings collected since the last run that fit the client's
request (deal type, budget, minimum rooms, areas) are:

* added to the client's shortlist as ``proposed`` with the note ``auto``,
* written as a CRM notification for the assigned agent (bell icon),
* sent to the agent's Telegram if they have a chat id (TELEGRAM_BOT_TOKEN).

Then the saved alert rules (CRM tab "Telegram") are applied: every new
listing that matches a rule is sent to the rule's Telegram recipients once.
The filter logic mirrors crm/src/lib/alerts.ts.
"""

from __future__ import annotations

import argparse
import logging
import os
import html
import uuid
from datetime import datetime, timedelta
from typing import Any

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


# --------------------------------------------------------------------------
# Saved alert rules
# --------------------------------------------------------------------------

RULE_COLUMNS = (
    "id", "name", "recipient_ids", "deal_types", "property_types", "areas", "sites", "poster_kind",
    "price_min", "price_max", "area_min", "area_max", "rooms_min", "rooms_max", "keywords", "created_at",
)
LISTING_COLUMNS = (
    "id", "site", "site_name", "link", "title", "deal_type", "property_type", "district", "neighbourhood",
    "price_usd", "price_gel", "area_m2", "rooms", "floor", "total_floors", "poster_kind", "phone", "image",
    "description", "collected_at",
)
MAX_PER_RULE = 15  # per run; the rest are summarised in one message
OWNER_LABEL = {"owner": "მესაკუთრე", "agent": "აგენტი"}


def split(value: Any) -> list[str]:
    return [part.strip() for part in str(value or "").split(",") if part.strip()]


def as_datetime(value: Any) -> datetime | None:
    """A naive local datetime from a DB value (Prisma SQLite stores milliseconds)."""
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000)
    if isinstance(value, datetime):
        return value if value.tzinfo is None else value.astimezone().replace(tzinfo=None)
    return None


def in_range(value: Any, low: Any, high: Any) -> bool:
    if low is None and high is None:
        return True
    if value is None:
        return False
    return (low is None or value >= low) and (high is None or value <= high)


def rule_matches(rule: dict[str, Any], listing: dict[str, Any]) -> bool:
    if split(rule["deal_types"]) and listing["deal_type"] not in split(rule["deal_types"]):
        return False
    if split(rule["property_types"]) and listing["property_type"] not in split(rule["property_types"]):
        return False
    if split(rule["sites"]) and listing["site"] not in split(rule["sites"]):
        return False
    areas = split(rule["areas"])
    if areas and listing["district"] not in areas and listing["neighbourhood"] not in areas:
        return False
    if rule["poster_kind"] and listing["poster_kind"] != rule["poster_kind"]:
        return False
    if not in_range(listing["price_usd"], rule["price_min"], rule["price_max"]):
        return False
    if not in_range(listing["area_m2"], rule["area_min"], rule["area_max"]):
        return False
    if not in_range(listing["rooms"], rule["rooms_min"], rule["rooms_max"]):
        return False
    words = split(rule["keywords"])
    if words:
        text = f"{listing['title'] or ''} {listing['description'] or ''}"
        if not any(word in text for word in words):
            return False
    return True


def listing_message(rule_name: str, listing: dict[str, Any], base_url: str) -> str:
    def e(value: Any) -> str:
        return html.escape(str(value))

    if listing["price_usd"]:
        price = f"${int(listing['price_usd']):,}"
    elif listing["price_gel"]:
        price = f"₾{int(listing['price_gel']):,}"
    else:
        price = "ფასი —"
    facts = [price]
    if listing["rooms"]:
        facts.append(f"{listing['rooms']} ოთ.")
    if listing["area_m2"]:
        facts.append(f"{listing['area_m2']:g} მ²")
    if listing["floor"] is not None:
        total = f"/{listing['total_floors']}" if listing["total_floors"] else ""
        facts.append(f"{listing['floor']}{total} სართ.")
    place = ", ".join(part for part in (listing["neighbourhood"], listing["district"]) if part)
    phone = (listing["phone"] or "").split(";")[0].strip()
    lines = [
        f"🔔 <b>{e(rule_name)}</b>",
        f"🏠 {e(listing['title'] or listing['id'])}",
        "💲 " + e(" · ".join(facts)),
    ]
    if place:
        lines.append(f"📍 {e(place)}")
    who = OWNER_LABEL.get(listing["poster_kind"] or "", "")
    if who or phone:
        lines.append("👤 " + e(" · ".join(part for part in (who, phone) if part)))
    links = []
    if base_url:
        links.append(f'<a href="{e(base_url)}/listings/{e(listing["id"])}">CRM</a>')
    if listing["link"]:
        links.append(f'<a href="{e(listing["link"])}">{e(listing["site_name"])}</a>')
    if links:
        lines.append("🔗 " + " · ".join(links))
    return "\n".join(lines)


def send_photo(token: str, chat_id: str, photo: str, caption: str) -> None:
    requests.post(
        f"https://api.telegram.org/bot{token}/sendPhoto",
        data={"chat_id": chat_id, "photo": photo, "caption": caption[:1024], "parse_mode": "HTML"},
        timeout=30,
    ).raise_for_status()


def record_delivery(db: storage.Database, rule_id: str, listing_id: str, stamp: Any) -> None:
    db.execute(
        'INSERT INTO "alert_deliveries" ("id", "rule_id", "listing_id", "sent_at") VALUES (?, ?, ?, ?)',
        (cuid(), rule_id, listing_id, stamp),
    )


def run_alert_rules(db: storage.Database, token: str, base_url: str) -> int:
    """Send new listings that match saved rules; returns how many were sent."""
    try:
        rules = [dict(zip(RULE_COLUMNS, row)) for row in db.execute(
            "SELECT " + ", ".join(f'"{c}"' for c in RULE_COLUMNS) + ' FROM "alert_rules" WHERE "active" = ?',
            (db.bool_value(True),),
        ).fetchall()]
    except Exception as exc:  # table not created yet (CRM not deployed)
        LOGGER.info("alert rules skipped: %s", exc)
        db.conn.rollback()
        return 0
    if not rules:
        return 0
    chats = dict(db.execute('SELECT "id", "chat_id" FROM "telegram_recipients" WHERE "chat_id" IS NOT NULL').fetchall())
    now = datetime.now()
    # A rule only sees listings first collected after it was created, at most
    # a day back, so a skipped run still catches up without flooding.
    oldest = now - timedelta(hours=24)
    starts = {rule["id"]: max(as_datetime(rule["created_at"]) or oldest, oldest) for rule in rules}
    fresh = [dict(zip(LISTING_COLUMNS, row)) for row in db.execute(
        "SELECT " + ", ".join(f'"{c}"' for c in LISTING_COLUMNS)
        + ' FROM "listings" WHERE "archived" = ? AND "collected_at" >= ? ORDER BY "collected_at"',
        (db.bool_value(False), db.date_value(min(starts.values()))),
    ).fetchall()]
    sent_total = 0
    for rule in rules:
        targets = [chats[r] for r in split(rule["recipient_ids"]) if chats.get(r)]
        if not targets:
            continue
        done = {row[0] for row in db.execute('SELECT "listing_id" FROM "alert_deliveries" WHERE "rule_id" = ?', (rule["id"],)).fetchall()}
        matches = [
            listing for listing in fresh
            if listing["id"] not in done
            and (as_datetime(listing["collected_at"]) or now) >= starts[rule["id"]]
            and rule_matches(rule, listing)
        ]
        if not matches:
            continue
        stamp = db.date_value(now)
        sent = 0
        for listing in matches[:MAX_PER_RULE]:
            text = listing_message(rule["name"], listing, base_url)
            delivered = False
            for chat_id in targets:
                try:
                    if listing["image"]:
                        try:
                            send_photo(token, chat_id, listing["image"], text)
                        except Exception:  # unusable image URL: send the text alone
                            send_telegram(token, chat_id, text)
                    else:
                        send_telegram(token, chat_id, text)
                    delivered = True
                except Exception as exc:
                    LOGGER.warning("alert %s to %s failed: %s", rule["id"], chat_id, exc)
            if delivered:
                record_delivery(db, rule["id"], listing["id"], stamp)
                sent += 1
        rest = matches[MAX_PER_RULE:]
        if rest:
            summary = f"🔔 <b>{html.escape(rule['name'])}</b>: კიდევ {len(rest)} ახალი განცხადება."
            if base_url:
                summary += f"\n{base_url}/alerts/{rule['id']}"
            for chat_id in targets:
                try:
                    send_telegram(token, chat_id, summary)
                except Exception as exc:
                    LOGGER.warning("alert summary to %s failed: %s", chat_id, exc)
            for listing in rest:
                record_delivery(db, rule["id"], listing["id"], stamp)
        db.execute(
            'UPDATE "alert_rules" SET "sent_count" = "sent_count" + ?, "last_sent_at" = ? WHERE "id" = ?',
            (sent, stamp, rule["id"]),
        )
        db.commit()
        sent_total += sent
        LOGGER.info("rule %s (%s): %s sent, %s summarised", rule["id"], rule["name"], sent, len(rest))
    return sent_total


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
        if token:
            LOGGER.info("alert messages sent=%s", run_alert_rules(db, token, base_url))
        else:
            LOGGER.info("TELEGRAM_BOT_TOKEN not set; alert rules skipped")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
