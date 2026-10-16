"""Post queued publications to our own channels (Telegram, Facebook page).

Agents queue a listing in the CRM ("გამოქვეყნება"): the CRM stores the
generated text, the contact phone and the channel in the ``publications``
table.  This worker, run by the scheduled GitHub Action, posts every queued
item and records the result.  Website channels are left as ``manual`` so an
agent can copy the text to a site that has no API.

Secrets / settings:
  TELEGRAM_BOT_TOKEN   bot token from @BotFather (the bot must be an admin of
                       the channel); the channel id or @username is the
                       publication's ``target`` (default from the
                       ``telegram_channel`` setting)
  FACEBOOK_PAGE_TOKEN  a Page access token with pages_manage_posts; the page
                       id is the publication's ``target`` (default from the
                       ``facebook_page_id`` setting)
"""

from __future__ import annotations

import argparse
import logging
import os
from datetime import datetime

import requests

import storage

LOGGER = logging.getLogger("publish")
GRAPH = "https://graph.facebook.com/v21.0"


def setting(db: storage.Database, key: str, default: str = "") -> str:
    row = db.execute('SELECT "value" FROM "settings" WHERE "key" = ?', (key,)).fetchone()
    return str(row[0]) if row and row[0] is not None else default


def post_telegram(token: str, target: str, text: str, image: str | None) -> str:
    if image:
        response = requests.post(
            f"https://api.telegram.org/bot{token}/sendPhoto",
            data={"chat_id": target, "photo": image, "caption": text[:1024], "parse_mode": "HTML"},
            timeout=60,
        )
        if response.ok:
            return str(response.json()["result"]["message_id"])
        LOGGER.warning("sendPhoto failed (%s); falling back to text", response.text[:200])
    response = requests.post(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data={"chat_id": target, "text": text[:4096], "parse_mode": "HTML", "disable_web_page_preview": False},
        timeout=60,
    )
    response.raise_for_status()
    return str(response.json()["result"]["message_id"])


def post_facebook(token: str, page_id: str, text: str, image: str | None) -> str:
    if image:
        response = requests.post(
            f"{GRAPH}/{page_id}/photos",
            data={"url": image, "caption": text, "access_token": token},
            timeout=60,
        )
        if response.ok:
            return str(response.json().get("post_id") or response.json().get("id"))
        LOGGER.warning("photo post failed (%s); falling back to text", response.text[:200])
    response = requests.post(f"{GRAPH}/{page_id}/feed", data={"message": text, "access_token": token}, timeout=60)
    response.raise_for_status()
    return str(response.json()["id"])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL", ""))
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--log-level", default=os.getenv("LOG_LEVEL", "INFO"))
    args = parser.parse_args()
    logging.basicConfig(level=getattr(logging, args.log_level.upper(), logging.INFO), format="%(asctime)s %(levelname)s %(message)s")
    if not args.database_url:
        LOGGER.error("DATABASE_URL is required")
        return 1

    telegram_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    facebook_token = os.getenv("FACEBOOK_PAGE_TOKEN", "").strip()
    db = storage.Database(args.database_url)
    try:
        default_telegram = setting(db, "telegram_channel")
        default_facebook = setting(db, "facebook_page_id")
        rows = db.execute(
            'SELECT p."id", p."channel", p."target", p."text", l."image" '
            'FROM "publications" p JOIN "listings" l ON l."id" = p."listing_id" '
            'WHERE p."status" = ? ORDER BY p."created_at" LIMIT ?',
            ("queued", args.limit),
        ).fetchall()
        posted = failed = 0
        for pub_id, channel, target, text, image in rows:
            try:
                if channel == "telegram":
                    if not telegram_token:
                        raise RuntimeError("TELEGRAM_BOT_TOKEN secret is not set")
                    external = post_telegram(telegram_token, target or default_telegram, text, image)
                elif channel == "facebook":
                    if not facebook_token:
                        raise RuntimeError("FACEBOOK_PAGE_TOKEN secret is not set")
                    external = post_facebook(facebook_token, target or default_facebook, text, image)
                else:
                    db.execute('UPDATE "publications" SET "status" = ? WHERE "id" = ?', ("manual", pub_id))
                    continue
                db.execute(
                    'UPDATE "publications" SET "status" = ?, "external_id" = ?, "posted_at" = ?, "error" = NULL WHERE "id" = ?',
                    ("posted", external, db.date_value(datetime.now()), pub_id),
                )
                posted += 1
            except Exception as exc:  # keep going; the error is shown in the CRM queue
                failed += 1
                db.execute('UPDATE "publications" SET "status" = ?, "error" = ? WHERE "id" = ?', ("failed", str(exc)[:500], pub_id))
                LOGGER.warning("publication %s failed: %s", pub_id, exc)
        db.commit()
        LOGGER.info("publications queued=%s posted=%s failed=%s", len(rows), posted, failed)
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
