"""Browser relay: pages a site refuses to give the collector.

Some sites (ss.ge, binebi.ge) answer GitHub's servers with HTTP 403.  When
that happens, ``sites.common.get_html`` asks this relay instead:

* if an agent's Chrome extension already downloaded the page (table
  ``relay_pages``), the collector uses that copy;
* otherwise the URL is added to ``relay_requests``; the extension downloads it
  from the agent's own connection when Chrome is open (at start and every 30
  minutes), and the CRM starts the collector again to process it.

Result pages must be fresh (an hour); a listing's detail page may be older.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import storage

LOGGER = logging.getLogger("relay")
LIST_MAX_AGE = timedelta(hours=1)
DETAIL_MAX_AGE = timedelta(days=14)


def parse_time(value: Any) -> datetime | None:
    """A database time (datetime, ISO text or SQLite epoch ms) as aware UTC."""
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


def is_list_url(url: str) -> bool:
    return "page=" in url


class Relay:
    """Looks pages up in the database and remembers the ones still needed."""

    def __init__(self, database_url: str):
        self.database_url = database_url
        self.wanted: dict[str, str] = {}
        self.used = 0
        # RELAY_HOSTS=home.ss.ge,binebi.ge sends these hosts straight to the
        # relay (no direct request first); blocked hosts are added at runtime.
        self.blocked: set[str] = {h.strip() for h in os.getenv("RELAY_HOSTS", "").split(",") if h.strip()}

    def page(self, url: str) -> str | None:
        db = storage.Database(self.database_url)
        try:
            row = db.execute('SELECT "html", "fetched_at" FROM "relay_pages" WHERE "url" = ?', (url,)).fetchone()
        except Exception as exc:  # table missing (CRM not deployed yet)
            LOGGER.debug("relay lookup failed: %s", exc)
            return None
        finally:
            db.close()
        if not row:
            return None
        fetched = parse_time(row[1])
        max_age = LIST_MAX_AGE if is_list_url(url) else DETAIL_MAX_AGE
        if not fetched or datetime.now(timezone.utc) - fetched > max_age:
            return None
        self.used += 1
        return row[0]

    def want(self, url: str, reason: str) -> None:
        self.wanted[url] = reason

    def save_wanted(self) -> int:
        """Write the pages still needed for the extension; returns how many."""
        if not self.wanted:
            return 0
        db = storage.Database(self.database_url)
        try:
            now = db.date_value(datetime.now())
            for url in self.wanted:
                db.execute(
                    'INSERT INTO "relay_requests" ("url", "created_at") VALUES (?, ?) ON CONFLICT ("url") DO NOTHING',
                    (url, now),
                )
            db.commit()
        except Exception as exc:
            LOGGER.warning("could not save relay requests: %s", exc)
            return 0
        finally:
            db.close()
        LOGGER.info("relay: %s pages asked of the browser extension", len(self.wanted))
        return len(self.wanted)
