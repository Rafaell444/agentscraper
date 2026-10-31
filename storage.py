"""Storage for collected listings: the CRM database, or CSV files as fallback.

When ``DATABASE_URL`` is set (Supabase Postgres in the cloud, or the CRM's
local SQLite file) listings are read from and written to the ``listings``
table that the CRM uses, so the database is the single source of truth and
nothing needs to be committed to git.  Without it, ``data/<site>.csv`` files
are used, which is handy for local experiments.

Each listing row is a dict keyed by ``sites.common.COLUMNS``.  The database
additionally keeps ``poster_kind`` (owner / agent), ``property_key`` (joins
copies of the same property across sites and posters) and a price history.
"""

from __future__ import annotations

import csv
import json
import os
import re
import sqlite3
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from sites.common import COLUMNS, LOCAL_TIMEZONE, OWNER_PHYSICAL, normalize_id, number

DATA_DIR = Path(os.getenv("DATA_DIR", "data"))
ENCODING = "utf-8-sig"  # BOM so Excel opens the CSV with Georgian text intact

COLUMN_MAP = {
    "Link": "link",
    "Title": "title",
    "Deal Type": "deal_type",
    "Property Type": "property_type",
    "Status": "status",
    "Condition": "condition",
    "City": "city",
    "District": "district",
    "Neighbourhood": "neighbourhood",
    "Address": "address",
    "Owner Type": "owner_type",
    "Owner Name": "owner_name",
    "Phone Number": "phone",
    "Agency": "agency",
    "VIP": "vip",
    "Description": "description",
    "Image": "image",
    "Images": "images",
    "Detail Status": "detail_status",
    "Cadastral Code": "cadastral_code",
}
FLOAT_MAP = {
    "Area m2": "area_m2",
    "Yard Area m2": "yard_area_m2",
    "Price USD": "price_usd",
    "Price GEL": "price_gel",
    "Price per m2 USD": "price_per_m2_usd",
    "Lat": "lat",
    "Lng": "lng",
}
INT_MAP = {
    "Rooms": "rooms",
    "Bedrooms": "bedrooms",
    "Bathrooms": "bathrooms",
    "Floor": "floor",
    "Total Floors": "total_floors",
}
DATE_MAP = {
    "Posted": "posted_at",
    "Updated": "site_updated_at",
    "Timestamp Added": "collected_at",
}
LISTING_COLUMNS = (
    ["id", "site", "site_name", "property_id"]
    + list(COLUMN_MAP.values())
    + list(FLOAT_MAP.values())
    + list(INT_MAP.values())
    + list(DATE_MAP.values())
    + ["poster_kind", "property_key", "archived", "last_sync_at"]
)


def database_url() -> str:
    return os.getenv("DATABASE_URL", "").strip()


# --------------------------------------------------------------------------
# Derived fields
# --------------------------------------------------------------------------

def poster_kind(row: dict[str, Any]) -> str:
    """``owner`` for direct owners, ``agent`` for everyone else known, else ``""``."""
    owner_type = str(row.get("Owner Type") or "").strip()
    if not owner_type:
        return ""
    return "owner" if owner_type == OWNER_PHYSICAL else "agent"


_STREET_NOISE = {"ქ", "ქუჩა", "ქუჩაზე", "გამზ", "გამზირი", "გამზირზე", "ჩიხი", "შეს", "შესახვევი", "ხეივანი", "ხეივ", "მოედანი", "დასახლება", "დას", "კორპ", "ბინა", "მ/რ", "მკრ"}


def street_token(address: Any) -> str:
    """First meaningful word of a street address, trimmed so declensions match
    (``შარტავას ქ. 43`` and ``შარტავა 43`` both give ``შარტა``)."""
    text = re.sub(r"[\d.,;:/()\-–№#]+", " ", str(address or "").lower())
    for word in text.split():
        if len(word) >= 4 and word not in _STREET_NOISE and not word.endswith("."):
            return word[:5]
    return ""


def property_key(row: dict[str, Any]) -> str:
    """Key shared by postings of the same property.

    Deal type, area (2 m² buckets), rooms and place are not enough: every
    2-room 52 m² flat for sale in Saburtalo would match.  The key therefore
    also needs the floor and the street.  Postings missing either only match
    other postings that miss it too, which keeps false matches rare.
    """
    area = number(row.get("Area m2"))
    rooms = number(row.get("Rooms"))
    place = str(row.get("Neighbourhood") or row.get("District") or "").strip()
    deal = str(row.get("Deal Type") or "").strip()
    if area == "" or rooms == "" or not place or not deal:
        return ""
    bucket = int(round(float(area) / 2.0)) * 2
    floor = number(row.get("Floor"))
    floor_text = str(int(floor)) if floor != "" else "?"
    street = street_token(row.get("Address")) or "?"
    return f"{deal}|{bucket}|{int(rooms)}|{place}|{floor_text}|{street}"


# --------------------------------------------------------------------------
# CSV backend
# --------------------------------------------------------------------------

def csv_path(site_key: str) -> Path:
    return DATA_DIR / f"{site_key}.csv"


def _serialize(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        return str(int(value)) if value.is_integer() else f"{value:.2f}"
    return str(value)


def load_csv_rows(site_key: str) -> dict[str, dict[str, Any]]:
    path = csv_path(site_key)
    rows: dict[str, dict[str, Any]] = {}
    if not path.exists():
        return rows
    with path.open("r", encoding=ENCODING, newline="") as handle:
        for record in csv.DictReader(handle):
            row = {column: (record.get(column) or "") for column in COLUMNS}
            row["Property ID"] = normalize_id(row["Property ID"])
            if row["Property ID"] and row["Property ID"] not in rows:
                rows[row["Property ID"]] = row
    return rows


def save_csv_rows(site_key: str, rows: dict[str, dict[str, Any]]) -> bool:
    path = csv_path(site_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w", prefix=f".{site_key}-", suffix=".csv", dir=path.parent,
            delete=False, encoding=ENCODING, newline="",
        ) as handle:
            temp_name = handle.name
            writer = csv.DictWriter(handle, fieldnames=COLUMNS, lineterminator="\n")
            writer.writeheader()
            for row in rows.values():
                writer.writerow({column: _serialize(row.get(column)) for column in COLUMNS})
        if path.exists() and path.read_bytes() == Path(temp_name).read_bytes():
            return False
        os.replace(temp_name, path)
        temp_name = None
        return True
    finally:
        if temp_name and os.path.exists(temp_name):
            os.unlink(temp_name)


# --------------------------------------------------------------------------
# Database backend (SQLite via Prisma locally, Postgres in the cloud)
# --------------------------------------------------------------------------

def parse_date(text: Any) -> datetime | None:
    value = str(text or "").strip()
    if not value:
        return None
    value = value.replace("T", " ")[:19]
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def to_float(text: Any) -> float | None:
    try:
        return float(text) if str(text).strip() != "" else None
    except (TypeError, ValueError):
        return None


def to_int(text: Any) -> int | None:
    value = to_float(text)
    return int(value) if value is not None else None


class Database:
    """Minimal dual-dialect wrapper around sqlite3 / psycopg."""

    def __init__(self, url: str):
        self.url = url
        if url.startswith("file:"):
            path = Path(url[5:]).expanduser()
            if not path.is_absolute():
                path = Path(__file__).resolve().parent / "crm" / "prisma" / path
            path.parent.mkdir(parents=True, exist_ok=True)
            self.dialect = "sqlite"
            self.conn = sqlite3.connect(path)
            self.placeholder = "?"
        else:
            import psycopg  # imported lazily so local SQLite use needs no driver

            self.dialect = "postgres"
            self.conn = psycopg.connect(url)
            self.placeholder = "%s"
        # Columns the CRM schema adds later (lat, lng, images) are created by
        # the CRM's deploy; until then they are simply not read or written.
        existing = self.table_columns("listings")
        self.listing_columns = [column for column in LISTING_COLUMNS if not existing or column in existing]

    def table_columns(self, table: str) -> set[str]:
        if self.dialect == "sqlite":
            return {row[1] for row in self.conn.execute(f'PRAGMA table_info("{table}")').fetchall()}
        cursor = self.conn.cursor()
        cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name = %s", (table,))
        return {row[0] for row in cursor.fetchall()}

    # -- value conversion --------------------------------------------------

    def date_value(self, value: datetime | None) -> Any:
        if value is None:
            return None
        # Prisma stores SQLite DateTime as milliseconds since the Unix epoch.
        if self.dialect == "sqlite":
            return int(value.replace(tzinfo=LOCAL_TIMEZONE).timestamp() * 1000)
        return value.replace(tzinfo=LOCAL_TIMEZONE)

    def date_text(self, value: Any) -> str:
        if value is None or value == "":
            return ""
        if isinstance(value, (int, float)):
            value = datetime.fromtimestamp(value / 1000, LOCAL_TIMEZONE)
        if isinstance(value, datetime):
            if value.tzinfo is not None:
                value = value.astimezone(LOCAL_TIMEZONE)
            return value.strftime("%Y-%m-%d %H:%M:%S")
        return str(value)

    def bool_value(self, value: bool) -> Any:
        return (1 if value else 0) if self.dialect == "sqlite" else value

    # -- statements --------------------------------------------------------

    def execute(self, sql: str, params: tuple = ()) -> Any:
        cursor = self.conn.cursor()
        cursor.execute(sql.replace("?", self.placeholder), params)
        return cursor

    def executemany(self, sql: str, rows: list[tuple]) -> None:
        if not rows:
            return
        cursor = self.conn.cursor()
        cursor.executemany(sql.replace("?", self.placeholder), rows)

    def commit(self) -> None:
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    # -- listings ----------------------------------------------------------

    def load_site(self, site_key: str, include_archived: bool = False) -> dict[str, dict[str, Any]]:
        columns = ", ".join(f'"{column}"' for column in self.listing_columns)
        where = '"site" = ?' + ("" if include_archived else ' AND "archived" = ?')
        params: tuple = (site_key,) if include_archived else (site_key, self.bool_value(False))
        cursor = self.execute(f'SELECT {columns} FROM "listings" WHERE {where} ORDER BY "collected_at"', params)
        rows: dict[str, dict[str, Any]] = {}
        for values in cursor.fetchall():
            record = dict(zip(self.listing_columns, values))
            row = {column: "" for column in COLUMNS}
            row["Property ID"] = normalize_id(record["property_id"])
            for column, field in COLUMN_MAP.items():
                row[column] = record.get(field) or ""
            for column, field in FLOAT_MAP.items():
                row[column] = record[field] if record.get(field) is not None else ""
            for column, field in INT_MAP.items():
                row[column] = record[field] if record.get(field) is not None else ""
            for column, field in DATE_MAP.items():
                row[column] = self.date_text(record.get(field))
            if row["Property ID"]:
                rows[row["Property ID"]] = row
        return rows

    def save_site(self, site_key: str, site_name: str, rows: dict[str, dict[str, Any]], archive_missing: bool = True) -> None:
        """Upsert ``rows``; with ``archive_missing`` every other listing of the
        site is archived (a full collector run).  A single-listing fetch passes
        False so it never touches other listings."""
        now = datetime.now()
        previous_prices = dict(
            self.execute('SELECT "property_id", "price_usd" FROM "listings" WHERE "site" = ?', (site_key,)).fetchall()
        )
        tuples: list[tuple] = []
        history: list[tuple] = []
        for row in rows.values():
            values: dict[str, Any] = {
                "id": f"{site_key}:{row['Property ID']}",
                "site": site_key,
                "site_name": site_name,
                "property_id": row["Property ID"],
            }
            for column, field in COLUMN_MAP.items():
                values[field] = str(row.get(column) or "") or None
            for column, field in FLOAT_MAP.items():
                values[field] = to_float(row.get(column))
            for column, field in INT_MAP.items():
                values[field] = to_int(row.get(column))
            for column, field in DATE_MAP.items():
                values[field] = self.date_value(parse_date(row.get(column)))
            values["poster_kind"] = poster_kind(row) or None
            values["property_key"] = property_key(row) or None
            values["archived"] = self.bool_value(False)
            values["last_sync_at"] = self.date_value(now)
            tuples.append(tuple(values[column] for column in self.listing_columns))

            price = values["price_usd"]
            known = row["Property ID"] in previous_prices
            old_price = previous_prices.get(row["Property ID"])
            if price is not None and (not known or old_price is None or abs(float(old_price) - price) >= 1):
                history.append((uuid.uuid4().hex, values["id"], price, self.date_value(now)))

        columns = ", ".join(f'"{column}"' for column in self.listing_columns)
        placeholders = ", ".join("?" for _ in self.listing_columns)
        updates = ", ".join(
            f'"{column}" = excluded."{column}"'
            for column in self.listing_columns
            if column not in {"id", "site", "property_id"}
        )
        self.executemany(
            f'INSERT INTO "listings" ({columns}) VALUES ({placeholders}) '
            f'ON CONFLICT ("site", "property_id") DO UPDATE SET {updates}',
            tuples,
        )
        self.executemany(
            'INSERT INTO "price_history" ("id", "listing_id", "price_usd", "seen_at") VALUES (?, ?, ?, ?)',
            history,
        )
        # Listings no longer present are archived, never deleted: agents' notes stay attached.
        ids = list(rows.keys())
        if not archive_missing:
            self.commit()
            return
        if ids:
            marks = ", ".join("?" for _ in ids)
            self.execute(
                f'UPDATE "listings" SET "archived" = ? WHERE "site" = ? AND "property_id" NOT IN ({marks})',
                (self.bool_value(True), site_key, *ids),
            )
        else:
            self.execute('UPDATE "listings" SET "archived" = ? WHERE "site" = ?', (self.bool_value(True), site_key))
        self.commit()


# --------------------------------------------------------------------------
# Public API used by the collector, the enricher and the workbook builder
# --------------------------------------------------------------------------

def site_name(site_key: str) -> str:
    from sites import load_site

    return load_site(site_key).SHEET


def load_rows(site_key: str, include_archived: bool = False) -> dict[str, dict[str, Any]]:
    """Return ``Property ID -> row`` for one site from the database or CSV."""
    url = database_url()
    if not url:
        return load_csv_rows(site_key)
    db = Database(url)
    try:
        return db.load_site(site_key, include_archived=include_archived)
    finally:
        db.close()


def save_rows(site_key: str, rows: dict[str, dict[str, Any]]) -> bool:
    """Persist all rows of one site; return whether anything was written."""
    url = database_url()
    if not url:
        return save_csv_rows(site_key, rows)
    db = Database(url)
    try:
        db.save_site(site_key, site_name(site_key), rows)
    finally:
        db.close()
    return True


def load_health() -> dict[str, Any]:
    """Per-site result of the previous collector runs (settings key ``collector_health``)."""
    url = database_url()
    if not url:
        return {}
    db = Database(url)
    try:
        row = db.execute('SELECT "value" FROM "settings" WHERE "key" = ?', ("collector_health",)).fetchone()
        return json.loads(row[0]) if row and row[0] else {}
    except Exception:  # settings table missing (CRM not deployed) or bad JSON
        return {}
    finally:
        db.close()


def save_health(health: dict[str, Any]) -> None:
    """Store per-site results so ops_alert.py can name a site that keeps failing."""
    url = database_url()
    if not url:
        return
    db = Database(url)
    try:
        db.execute(
            'INSERT INTO "settings" ("key", "value", "updated_at") VALUES (?, ?, ?) '
            'ON CONFLICT ("key") DO UPDATE SET "value" = excluded."value", "updated_at" = excluded."updated_at"',
            ("collector_health", json.dumps(health, ensure_ascii=False), db.date_value(datetime.now())),
        )
        db.commit()
    finally:
        db.close()


def save_one(site_key: str, row: dict[str, Any]) -> None:
    """Upsert one listing (on-demand fetch from the CRM) without archiving others."""
    url = database_url()
    if not url:
        raise RuntimeError("DATABASE_URL is required to save a single listing")
    db = Database(url)
    try:
        db.save_site(site_key, site_name(site_key), {row["Property ID"]: row}, archive_missing=False)
    finally:
        db.close()


def merge_row(existing: dict[str, Any], update: dict[str, Any]) -> bool:
    """Copy non-empty fields from ``update`` into ``existing``; report changes."""
    changed = False
    for column, value in update.items():
        if column not in COLUMNS or column == "Timestamp Added":
            continue
        if value in ("", None):
            continue
        if _serialize(existing.get(column)) != _serialize(value):
            existing[column] = value
            changed = True
    return changed
