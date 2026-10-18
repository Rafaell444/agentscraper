"""MyHome.ge adapter (TNET).  The result pages embed every listing as JSON.

No search filter is applied: the feed is the whole site ordered by last
update, so delta runs read the first pages and pick up every new or bumped
listing.  Phone numbers are masked in the public JSON; ``phone_enricher.py``
reveals them through the site's own show-number button for owner listings.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import urljoin

import requests

from sites.common import (
    DEAL_DAILY,
    DEAL_MORTGAGE,
    DEAL_RENT,
    DEAL_SALE,
    LOCAL_TIMEZONE,
    OWNER_AGENT,
    OWNERS_ONLY,
    OWNER_DEVELOPER,
    OWNER_PHYSICAL,
    ScraperError,
    get_html,
    integer,
    new_row,
    next_data,
    normalize_id,
    number,
    polite_pause,
    truncate,
)

KEY = "myhome"
SHEET = "MyHome"
BASE_URL = "https://www.myhome.ge"
# Tbilisi (cities=1), every poster, deal and property type.  OWNERS_ONLY=1
# narrows the feed to direct owners (owner_type=physical).
LIST_URL = BASE_URL + "/udzravi-qoneba/tbilisi/?cities=1&page={page}"
OWNERS_LIST_URL = BASE_URL + "/udzravi-qoneba/tbilisi/?cities=1&owner_type=physical&page={page}"

DEAL_TYPES = {1: DEAL_SALE, 2: DEAL_RENT, 3: DEAL_MORTGAGE, 7: DEAL_DAILY}
PROPERTY_TYPES = {
    1: "ბინა",
    2: "კერძო სახლი",
    3: "აგარაკი",
    4: "მიწის ნაკვეთი",
    5: "კომერციული ფართი",
    6: "სასტუმრო",
}
# Building status applies to residential types; other ids are category codes.
STATUSES = {1: "ახალი აშენებული", 2: "ძველი აშენებული", 3: "მშენებარე"}
OWNER_TYPES = {
    "physical": OWNER_PHYSICAL,
    "agent": OWNER_AGENT,
    "broker": "ბროკერი",
    "developer": OWNER_DEVELOPER,
    "company": "კომპანია",
}


def dehydrated_queries(payload: dict[str, Any]) -> list[dict[str, Any]]:
    return (
        payload.get("props", {})
        .get("pageProps", {})
        .get("dehydratedState", {})
        .get("queries", [])
    )


def extract_listing_records(payload: dict[str, Any]) -> list[dict[str, Any]]:
    for query in dehydrated_queries(payload):
        query_hash = str(query.get("queryHash", ""))
        if "statements" not in query_hash or "list" not in query_hash:
            continue
        state_data = query.get("state", {}).get("data", {})
        records = state_data.get("data", {}).get("data")
        if isinstance(records, list):
            return [item for item in records if isinstance(item, dict)]
    raise ScraperError("The statements/list data structure was not found")


def extract_detail_record(payload: dict[str, Any]) -> dict[str, Any]:
    for query in dehydrated_queries(payload):
        query_hash = str(query.get("queryHash", ""))
        if "statements" not in query_hash or "details" not in query_hash:
            continue
        statement = (
            query.get("state", {}).get("data", {}).get("data", {}).get("statement")
        )
        if isinstance(statement, dict):
            return statement
    raise ScraperError("The statements/details data structure was not found")


def listing_link(record: dict[str, Any]) -> str:
    property_id = normalize_id(record.get("id"))
    slug = record.get("dynamic_slug") or (record.get("href_lang") or {}).get("ka")
    if slug:
        return urljoin(BASE_URL, f"/udzravi-qoneba/{slug}-{property_id}/")
    return urljoin(BASE_URL, f"/udzravi-qoneba/-{property_id}/")


def price_block(record: dict[str, Any], currency: str) -> dict[str, Any]:
    block = (record.get("price") or {}).get(currency)
    return block if isinstance(block, dict) else {}


def vip_label(record: dict[str, Any]) -> str:
    if record.get("is_super_vip"):
        return "S-VIP"
    if record.get("is_vip_plus"):
        return "VIP+"
    if record.get("is_vip"):
        return "VIP"
    return ""


def image_url(record: dict[str, Any]) -> str:
    images = record.get("images") or []
    first = images[0] if images else None
    if isinstance(first, dict):
        for key in ("thumb", "large", "original", "url"):
            if first.get(key):
                return str(first[key])
        return ""
    return str(first or "")


def posted_from_age(record: dict[str, Any]) -> str:
    """``quantity_of_day`` is the listing's age in days; it gives the posting
    date without opening the detail page."""
    age = record.get("quantity_of_day")
    try:
        days = int(age)
    except (TypeError, ValueError):
        return ""
    if days < 0:
        return ""
    return (datetime.now(LOCAL_TIMEZONE) - timedelta(days=days)).strftime("%Y-%m-%d")


def row_from_record(record: dict[str, Any]) -> dict[str, Any]:
    real_estate_type = record.get("real_estate_type_id")
    status = STATUSES.get(record.get("status_id"), "") if real_estate_type in (1, 2, 3, 6) else ""
    user_type = (record.get("user_type") or {}).get("type") or ""
    usd = price_block(record, "2")
    gel = price_block(record, "1")
    return new_row(**{
        "Posted": posted_from_age(record),
        "Property ID": record.get("id"),
        "Link": listing_link(record),
        "Title": str(record.get("dynamic_title") or "").strip(),
        "Deal Type": DEAL_TYPES.get(record.get("deal_type_id"), str(record.get("deal_type_id") or "")),
        "Property Type": PROPERTY_TYPES.get(real_estate_type, str(real_estate_type or "")),
        "Status": status,
        "City": record.get("city_name") or "",
        "District": record.get("district_name") or "",
        "Neighbourhood": record.get("urban_name") or "",
        "Address": record.get("address") or "",
        "Area m2": number(record.get("area")),
        "Yard Area m2": number(record.get("yard_area")),
        "Rooms": integer(record.get("room")),
        "Bedrooms": integer(record.get("bedroom")),
        "Floor": integer(record.get("floor")),
        "Total Floors": integer(record.get("total_floors")),
        "Price USD": number(usd.get("price_total")),
        "Price GEL": number(gel.get("price_total")),
        "Price per m2 USD": number(usd.get("price_square")),
        "Owner Type": OWNER_TYPES.get(user_type, user_type),
        "Owner Name": str(record.get("user_title") or "").strip(),
        "VIP": vip_label(record),
        "Updated": str(record.get("last_updated") or ""),
        "Description": truncate(record.get("comment")),
        "Image": image_url(record),
    })


def parse_list(session: requests.Session, page: int) -> list[dict[str, Any]]:
    url = (OWNERS_LIST_URL if OWNERS_ONLY else LIST_URL).format(page=page)
    records = extract_listing_records(next_data(get_html(session, url), url))
    return [row_from_record(record) for record in records if record.get("id")]


def needs_detail(row: dict[str, Any]) -> bool:
    # The list JSON carries the card data but no map point (lat/lng are null)
    # and only the first photo; the detail page is read once for those.
    # "Images" is "[]" after a read that found none, so it is not retried.
    return not row.get("Images")


def detail_photos(detail: dict[str, Any]) -> list[str]:
    urls = []
    for image in detail.get("images") or []:
        url = (image.get("large") or image.get("thumb")) if isinstance(image, dict) else image
        if url:
            urls.append(str(url))
    return list(dict.fromkeys(urls))[:30]


def detail_fields(detail: dict[str, Any]) -> dict[str, Any]:
    user_type = (detail.get("user_type") or {}).get("type") or ""
    return {
        "Condition": detail.get("condition") or "",
        "Posted": str(detail.get("created_at") or ""),
        "Owner Name": str(detail.get("owner_name") or "").strip(),
        "Owner Type": OWNER_TYPES.get(user_type, user_type),
        "Rooms": integer(detail.get("room_type_id")),
        "Bedrooms": integer(detail.get("bedroom_type_id")),
        "Bathrooms": integer(detail.get("bathroom_type_id")),
        "Yard Area m2": number(detail.get("yard_area")),
        "Lat": number(detail.get("lat")),
        "Lng": number(detail.get("lng")),
        "Images": json.dumps(detail_photos(detail)),
    }


def fetch_detail(session: requests.Session, row: dict[str, Any]) -> dict[str, Any]:
    polite_pause()
    url = str(row["Link"])
    return detail_fields(extract_detail_record(next_data(get_html(session, url), url)))


def fetch_one(session: requests.Session, url: str) -> dict[str, Any]:
    """A full row for one listing from its detail page (CRM on-demand import)."""
    detail = extract_detail_record(next_data(get_html(session, url), url))
    row = row_from_record(detail)
    row.update({key: value for key, value in detail_fields(detail).items() if value not in ("", None)})
    row["Detail Status"] = "done"
    return row
