"""Tell the agency on Telegram when something stops working.

Used by the GitHub workflows:

* ``python ops_alert.py --failed "Collector"`` from a step with ``if: failure()``
  sends "⚠️ Collector failed" with a link to the run;
* ``python ops_alert.py --check`` (every collector run) looks for silent
  problems: the scheduled-post publisher not running for over an hour, or no
  new listing saved for 6 hours.

Messages go to every connected Telegram recipient (CRM → Telegram tab).  The
same problem is reported at most once every 3 hours.
"""

from __future__ import annotations

import argparse
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

import storage

LOGGER = logging.getLogger("ops_alert")
REPEAT_HOURS = 3


def run_url() -> str:
    server = os.getenv("GITHUB_SERVER_URL", "https://github.com")
    repo = os.getenv("GITHUB_REPOSITORY", "")
    run_id = os.getenv("GITHUB_RUN_ID", "")
    return f"{server}/{repo}/actions/runs/{run_id}" if repo and run_id else ""


def setting(db: storage.Database, key: str) -> str | None:
    row = db.execute('SELECT "value" FROM "settings" WHERE "key" = ?', (key,)).fetchone()
    return row[0] if row else None


def save_setting(db: storage.Database, key: str, value: str) -> None:
    db.execute(
        'INSERT INTO "settings" ("key", "value", "updated_at") VALUES (?, ?, ?) '
        'ON CONFLICT ("key") DO UPDATE SET "value" = excluded."value", "updated_at" = excluded."updated_at"',
        (key, value, db.date_value(datetime.now())),
    )
    db.commit()


def parse_time(value: Any) -> datetime | None:
    """ISO text, a datetime, or epoch milliseconds (SQLite) → aware UTC datetime."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def send(db: storage.Database, token: str, key: str, text: str) -> int:
    """Send once per REPEAT_HOURS for the same key; returns how many chats got it."""
    last = parse_time(setting(db, f"ops_alert_{key}"))
    now = datetime.now(timezone.utc)
    if last and now - last < timedelta(hours=REPEAT_HOURS):
        LOGGER.info("%s: already reported at %s", key, last.isoformat())
        return 0
    chats = [row[0] for row in db.execute('SELECT "chat_id" FROM "telegram_recipients" WHERE "chat_id" IS NOT NULL').fetchall()]
    sent = 0
    for chat in chats:
        try:
            requests.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                data={"chat_id": chat, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True},
                timeout=20,
            ).raise_for_status()
            sent += 1
        except requests.RequestException as exc:
            LOGGER.warning("telegram %s: %s", chat, exc)
    save_setting(db, f"ops_alert_{key}", now.isoformat())
    LOGGER.info("%s: sent to %s chats", key, sent)
    return sent


def check(db: storage.Database, token: str) -> None:
    now = datetime.now(timezone.utc)
    last_run = parse_time(setting(db, "schedule_last_run"))
    # Only once the publisher has been set up (it has run at least once).
    if last_run and now - last_run > timedelta(hours=1):
        minutes = int((now - last_run).total_seconds() // 60)
        send(db, token, "scheduler", (
            "⚠️ <b>დაგეგმილი პოსტები არ ქვეყნდება</b>\n"
            f"Publisher ბოლოს {minutes} წუთის წინ გაეშვა (უნდა ეშვებოდეს ყოველ 10 წთ-ში).\n"
            "GitHub → Actions → „Publish scheduled posts“ — შეამოწმე, ჩართულია თუ არა და რა შეცდომაა."
        ))
    row = db.execute('SELECT MAX("collected_at") FROM "listings"').fetchone()
    newest = parse_time(row[0] if row else None)
    if newest and now - newest > timedelta(hours=6):
        hours = int((now - newest).total_seconds() // 3600)
        send(db, token, "collector_quiet", (
            "⚠️ <b>ახალი განცხადებები აღარ ემატება</b>\n"
            f"ბოლო განცხადება {hours} საათის წინ შეინახა. შესაძლოა საიტმა დიზაინი შეცვალა ან ბლოკავს.\n"
            + (f"ბოლო გაშვება: {run_url()}" if run_url() else "")
        ))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--failed", default="", help="name of the job that failed")
    parser.add_argument("--check", action="store_true", help="look for silent problems")
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL", ""))
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    if not token or not args.database_url:
        LOGGER.error("TELEGRAM_BOT_TOKEN and DATABASE_URL are required")
        return 0  # never fail the workflow because of the alert itself
    db = storage.Database(args.database_url)
    try:
        if args.failed:
            url = run_url()
            send(db, token, "failed_" + "".join(ch for ch in args.failed.lower() if ch.isalnum())[:30], (
                f"⚠️ <b>{args.failed} — შეცდომა</b>\n"
                "GitHub-ის სამუშაო ვერ დასრულდა.\n"
                + (f'<a href="{url}">ლოგის ნახვა</a>' if url else "")
            ))
        if args.check:
            check(db, token)
    except Exception as exc:  # the alert must not break the workflow
        LOGGER.error("ops alert failed: %s", exc)
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
