"""Helpers shared by every site adapter: HTTP session, parsing, row schema."""

from __future__ import annotations

import json
import logging
import os
import random
import re
import time
from datetime import datetime
from typing import Any, Iterable
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

LOGGER = logging.getLogger("collector")
LOCAL_TIMEZONE = ZoneInfo("Asia/Tbilisi")

# One schema for every site so the Excel tabs line up and can be filtered the
# same way.  Fields a site does not publish stay blank.
COLUMNS = [
    "Property ID",
    "Link",
    "Title",
    "Deal Type",
    "Property Type",
    "Status",
    "Condition",
    "City",
    "District",
    "Neighbourhood",
    "Address",
    "Area m2",
    "Yard Area m2",
    "Rooms",
    "Bedrooms",
    "Bathrooms",
    "Floor",
    "Total Floors",
    "Price USD",
    "Price GEL",
    "Price per m2 USD",
    "Owner Type",
    "Owner Name",
    "Phone Number",
    "Agency",
    "VIP",
    "Posted",
    "Updated",
    "Description",
    "Image",
    "Timestamp Added",
    "Detail Status",
    # Map point and every photo URL (JSON list) from the detail page; used by
    # the CRM's client posts, not shown in the workbook.
    "Lat",
    "Lng",
    "Images",
]
INTERNAL_COLUMNS = {"Lat", "Lng", "Images"}
NUMERIC_COLUMNS = {
    "Area m2", "Yard Area m2", "Rooms", "Bedrooms", "Bathrooms", "Floor",
    "Total Floors", "Price USD", "Price GEL", "Price per m2 USD",
}
DESCRIPTION_LIMIT = 2000

DEAL_SALE = "იყიდება"
DEAL_RENT = "ქირავდება"
DEAL_DAILY = "ქირავდება დღიურად"
DEAL_MORTGAGE = "გირავდება"

OWNER_PHYSICAL = "მესაკუთრე"
OWNER_AGENT = "აგენტი"
OWNER_DEVELOPER = "დეველოპერი"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/140.0.0.0 Safari/537.36"
)


class ScraperError(RuntimeError):
    """Raised when a page is valid HTTP but not usable scraper input."""


def env_int(name: str, default: int) -> int:
    try:
        return max(0, int(os.getenv(name, str(default))))
    except ValueError:
        LOGGER.warning("Invalid integer in %s; using %s", name, default)
        return default


def env_float(name: str, default: float) -> float:
    try:
        return max(0.0, float(os.getenv(name, str(default))))
    except ValueError:
        LOGGER.warning("Invalid number in %s; using %s", name, default)
        return default


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() not in {"0", "false", "no", "off"}


def now_iso() -> str:
    return datetime.now(LOCAL_TIMEZONE).isoformat(timespec="seconds")


# Collection scope.  FILTER_CITY="" keeps every city.  OWNERS_ONLY=1 restricts
# the collection to direct owners; by default owner and agent posts are both
# collected and told apart by the poster kind in the CRM.
FILTER_CITY = os.getenv("FILTER_CITY", "თბილისი").strip()
OWNERS_ONLY = env_bool("OWNERS_ONLY", False)


def city_matches(city: Any) -> bool:
    return not FILTER_CITY or FILTER_CITY in str(city or "")


# Keep only listings bumped/posted within this many days (0 = no limit).
MAX_AGE_DAYS = env_int("MAX_AGE_DAYS", 30)


def listing_date(row: dict[str, Any]) -> datetime | None:
    """Most recent site date of a row: last update, else posting date."""
    for column in ("Updated", "Posted", "Timestamp Added"):
        text = str(row.get(column) or "").strip()[:10]
        if len(text) == 10:
            try:
                return datetime.fromisoformat(text)
            except ValueError:
                continue
    return None


def is_recent(row: dict[str, Any]) -> bool:
    if not MAX_AGE_DAYS:
        return True
    when = listing_date(row)
    if when is None:
        return True
    return (datetime.now() - when).days <= MAX_AGE_DAYS


# Only listings posted at most this many days before the monitor first saw
# them are kept, so old ads that an owner merely bumps are ignored (0 = keep
# everything the feed shows).
NEW_WITHIN_DAYS = env_int("NEW_WITHIN_DAYS", 2)


def posted_date(row: dict[str, Any]) -> datetime | None:
    text = str(row.get("Posted") or "").strip()[:10]
    if len(text) != 10:
        return None
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def is_newly_added(row: dict[str, Any]) -> bool | None:
    """True/False once the posting date is known, None while it is unknown."""
    if not NEW_WITHIN_DAYS:
        return True
    posted = posted_date(row)
    if posted is None:
        return None
    added_text = str(row.get("Timestamp Added") or "")[:10]
    try:
        added = datetime.fromisoformat(added_text) if len(added_text) == 10 else datetime.now()
    except ValueError:
        added = datetime.now()
    return (added - posted).days <= NEW_WITHIN_DAYS


PHONE_IN_TEXT = re.compile(r"(?<!\d)(?:\+?995[\s\-]?)?(5\d{2})[\s\-]?(\d{2})[\s\-]?(\d{2})[\s\-]?(\d{2})(?!\d)")


def phones_in_text(text: Any) -> str:
    """Georgian mobile numbers written inside a description, e.g. ``599 12 34 56``."""
    found = ["".join(match.groups()) for match in PHONE_IN_TEXT.finditer(str(text or ""))]
    return "; ".join(dict.fromkeys(found))


def build_session() -> requests.Session:
    """Browser-like session with bounded GET retries and connection reuse."""
    session = requests.Session()
    # Certificate validation stays on in CI.  VERIFY_TLS=0 exists only for local
    # networks that inject an HTTPS-inspection certificate.
    session.verify = env_bool("VERIFY_TLS", True)
    if not session.verify:
        LOGGER.warning("VERIFY_TLS is disabled; use this only for local diagnostics")
        import urllib3

        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept": (
                "text/html,application/xhtml+xml,application/xml;q=0.9,"
                "image/avif,image/webp,*/*;q=0.8"
            ),
            "Accept-Language": "ka,en-US;q=0.9,en;q=0.8",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        }
    )
    retry = Retry(
        total=4,
        connect=4,
        read=4,
        status=4,
        backoff_factor=1.0,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET", "HEAD", "OPTIONS"}),
        respect_retry_after_header=True,
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=8, pool_maxsize=8)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    # PROXY_URL=socks5h://127.0.0.1:9150 routes every request through a running
    # Tor Browser (its SOCKS port); any http/https/socks5 proxy URL works.
    proxy_url = os.getenv("PROXY_URL", "").strip()
    if proxy_url:
        session.proxies = {"http": proxy_url, "https": proxy_url}
        LOGGER.info("Using proxy %s", proxy_url)
    return session


# Set by collect.py before a site runs so adapters can share one pause helper.
CURRENT_SITE = ""
SITE_DEFAULT_DELAY: float | None = None


def set_current_site(key: str, default_delay: float | None = None) -> None:
    global CURRENT_SITE, SITE_DEFAULT_DELAY
    CURRENT_SITE = key
    SITE_DEFAULT_DELAY = default_delay


def polite_pause() -> None:
    """Sleep between requests: ``<SITE>_REQUEST_DELAY_SECONDS`` > adapter default > global."""
    fallback = SITE_DEFAULT_DELAY if SITE_DEFAULT_DELAY is not None else env_float("REQUEST_DELAY_SECONDS", 0.35)
    delay = env_float(f"{CURRENT_SITE.upper()}_REQUEST_DELAY_SECONDS", fallback) if CURRENT_SITE else fallback
    if delay:
        time.sleep(delay + random.uniform(0, min(delay, 0.25)))


def get_html(session: requests.Session, url: str) -> str:
    response = session.get(url, timeout=(10, 35))
    if response.status_code != 200:
        raise ScraperError(f"GET {url} returned HTTP {response.status_code}")
    if "text/html" not in response.headers.get("Content-Type", ""):
        raise ScraperError(f"GET {url} did not return HTML")
    return response.text


def get_soup(session: requests.Session, url: str) -> BeautifulSoup:
    return BeautifulSoup(get_html(session, url), "html.parser")


def next_data(html: str, url: str) -> dict[str, Any]:
    """Return the ``__NEXT_DATA__`` JSON of a server-rendered Next.js page."""
    node = BeautifulSoup(html, "html.parser").find("script", id="__NEXT_DATA__")
    if node is None or not node.string:
        raise ScraperError(f"No __NEXT_DATA__ JSON found at {url}")
    try:
        return json.loads(node.string)
    except json.JSONDecodeError as exc:
        raise ScraperError(f"Invalid __NEXT_DATA__ JSON at {url}") from exc


def normalize_id(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    text = str(value).strip()
    return text[:-2] if text.endswith(".0") and text[:-2].isdigit() else text


def number(value: Any) -> float | str:
    """Parse ``1 234,5`` / ``1,234.5`` / ``84m²`` style values; blank if absent."""
    if value is None:
        return ""
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return ""
    text = re.sub(r"[^\d.,\-]", "", text.replace(" ", ""))
    # "145 კვ.მ." leaves trailing dots behind after stripping the letters.
    text = text.rstrip(".,")
    if not text or text in {"-", ".", ","}:
        return ""
    if re.fullmatch(r"\d{1,3}(\.\d{3})+", text):
        # "290.000" on housing.ge is two hundred ninety thousand.
        text = text.replace(".", "")
    elif "," in text and "." in text:
        text = text.replace(",", "")
    elif "," in text:
        # "1,234" is a thousands separator; "12,5" is a decimal comma.
        head, _, tail = text.rpartition(",")
        text = head.replace(",", "") + ("." if len(tail) != 3 else "") + tail
    try:
        return float(text)
    except ValueError:
        return ""


def integer(value: Any) -> int | str:
    parsed = number(value)
    return int(parsed) if isinstance(parsed, float) else ""


def clean_phone(value: Any) -> str:
    """Keep digits (and a leading +); masked numbers such as ``598 808 ***`` are dropped."""
    if value is None:
        return ""
    text = str(value).strip()
    if not text or "*" in text:
        return ""
    phone = re.sub(r"[^\d+]", "", text)
    phone = "+" + phone.lstrip("+") if text.startswith("+") else phone.lstrip("+")
    if phone.startswith("+995"):
        phone = phone[4:]
    elif phone.startswith("995") and len(phone) == 12:
        phone = phone[3:]
    return phone if len(phone) >= 6 else ""


def join_phones(values: Iterable[Any]) -> str:
    phones = [clean_phone(value) for value in values]
    return "; ".join(dict.fromkeys(phone for phone in phones if phone))


def deal_from_title(title: str) -> str:
    text = str(title or "").strip()
    if text.startswith(DEAL_DAILY):
        return DEAL_DAILY
    for deal in (DEAL_SALE, DEAL_RENT, DEAL_MORTGAGE):
        if text.startswith(deal):
            return deal
    return ""


_TYPE_PATTERNS = (
    ("ბინა", "ბინა"),
    ("კერძო სახლი", "კერძო სახლი"),
    ("საკუთარი სახლი", "კერძო სახლი"),
    ("სახლი", "კერძო სახლი"),
    ("აგარაკი", "აგარაკი"),
    ("მიწის ნაკვეთი", "მიწის ნაკვეთი"),
    ("მიწა", "მიწის ნაკვეთი"),
    ("სასტუმრო", "სასტუმრო"),
    ("კომერციული", "კომერციული ფართი"),
    ("საოფისე", "კომერციული ფართი"),
    ("ოფისი", "კომერციული ფართი"),
    ("სავაჭრო", "კომერციული ფართი"),
    ("ფართი", "კომერციული ფართი"),
)


def type_from_title(title: str) -> str:
    text = str(title or "")
    for needle, label in _TYPE_PATTERNS:
        if needle in text:
            return label
    return ""


def rooms_from_title(title: str) -> int | str:
    match = re.search(r"(\d+)\s*ოთახ", str(title or ""))
    return int(match.group(1)) if match else ""


def truncate(text: Any, limit: int = DESCRIPTION_LIMIT) -> str:
    if isinstance(text, dict):
        # SS.ge returns {"ka": ..., "en": ..., "ru": ...}; keep the Georgian text.
        text = text.get("ka") or next((value for value in text.values() if value), "")
    value = re.sub(r"<[^>]+>", " ", str(text or ""))
    value = re.sub(r"\s+", " ", value).strip()
    return value if len(value) <= limit else value[: limit - 1] + "…"


def new_row(**fields: Any) -> dict[str, Any]:
    row = {column: "" for column in COLUMNS}
    for key, value in fields.items():
        if key not in row:
            raise KeyError(f"Unknown column {key!r}")
        row[key] = "" if value is None else value
    row["Property ID"] = normalize_id(row["Property ID"])
    return row


def labelled_values(text_parts: list[str], labels: Iterable[str]) -> dict[str, str]:
    """Map ``label -> following token`` for ``label | value`` text sequences."""
    wanted = set(labels)
    found: dict[str, str] = {}
    for index, part in enumerate(text_parts[:-1]):
        key = part.strip().rstrip(":").strip()
        if key in wanted and key not in found:
            found[key] = text_parts[index + 1].strip()
    return found


def split_floor(value: Any) -> tuple[int | str, int | str]:
    """``5/10`` -> (5, 10); ``5`` -> (5, '')."""
    text = str(value or "").strip()
    match = re.match(r"^\s*(\d+)\s*/\s*(\d+)", text)
    if match:
        return int(match.group(1)), int(match.group(2))
    return integer(text), ""
