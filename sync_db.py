"""Copy ``data/*.csv`` into the CRM database (one-off / local helper).

The collector writes to the database directly when ``DATABASE_URL`` is set,
so this is only needed to load CSV files produced without a database:

    python sync_db.py --database-url "file:./dev.db"      # local SQLite
    python sync_db.py --database-url "postgresql://..."   # Supabase
"""

from __future__ import annotations

import argparse
import logging
import os

import storage
from sites import SITE_KEYS, load_site

LOGGER = logging.getLogger("sync-db")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL", "file:./dev.db"))
    parser.add_argument("--sites", default="", help="comma-separated site keys (default: all)")
    parser.add_argument("--log-level", default=os.getenv("LOG_LEVEL", "INFO"))
    args = parser.parse_args()
    logging.basicConfig(level=getattr(logging, args.log_level.upper(), logging.INFO), format="%(asctime)s %(levelname)s %(message)s")
    keys = [key.strip() for key in args.sites.split(",") if key.strip()] or list(SITE_KEYS)
    db = storage.Database(args.database_url)
    try:
        for key in keys:
            csv_rows = storage.load_csv_rows(key)
            if not csv_rows:
                LOGGER.info("%s: no CSV rows", key)
                continue
            existing = db.load_site(key, include_archived=True)
            for property_id, row in csv_rows.items():
                if property_id in existing:
                    storage.merge_row(existing[property_id], row)
                else:
                    existing[property_id] = row
            db.save_site(key, load_site(key).SHEET, existing)
            LOGGER.info("%s: %s rows in database", key, len(existing))
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
