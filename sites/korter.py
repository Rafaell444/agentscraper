"""korter.ge adapter.

Every korter.ge page carries its data as ``window.INITIAL_STATE`` JSON.  The
result pages (sale and rent, newest first) give the card data and map point;
the listing page adds the seller (owner / realtor / developer), the seller's
phone, the posting date, the description and every photo.
"""

from __future__ import annotations

import json
from typing import Any

import requests

from sites.common import (
    DEAL_RENT,
    DEAL_SALE,
    OWNER_AGENT,
    OWNER_DEVELOPER,
    OWNER_PHYSICAL,
    ScraperError,
    get_html,
    integer,
    join_phones,
    new_row,
    number,
    truncate,
)

KEY = "korter"
SHEET = "korter.ge"
BASE_URL = "https://korter.ge"
REQUEST_DELAY = 0.8

LISTS = (
    ("/binebis-yidva-gayidva-tbilisi", DEAL_SALE),
    ("/qiravdeba-binebi-tbilisshi", DEAL_RENT),
)
DEALS = {"sale": DEAL_SALE, "rent": DEAL_RENT}
SELLER_TYPES = {
    "owner": OWNER_PHYSICAL,
    "realtor": OWNER_AGENT,
    "agency": OWNER_AGENT,
    "developer": OWNER_DEVELOPER,
}


def page_state(html: str, url: str) -> dict[str, Any]:
    marker = html.find("window.INITIAL_STATE")
    start = html.find("{", marker) if marker >= 0 else -1
    if start < 0:
        raise ScraperError(f"No INITIAL_STATE JSON at {url}")
    try:
        return json.JSONDecoder().raw_decode(html[start:])[0]
    except json.JSONDecodeError as exc:
        raise ScraperError(f"Invalid INITIAL_STATE JSON at {url}") from exc


def iso(value: Any) -> str:
    text = str(value or "")
    return text[:19].replace("T", " ") if text else ""


def photo(media: Any) -> str:
    default = (media or {}).get("default") or {}
    return str(default.get("x2") or default.get("x1") or "")


def row_from_item(item: dict[str, Any], deal: str) -> dict[str, Any]:
    price = number(item.get("price"))
    currency = str(item.get("currency") or "USD").upper()
    area = number(item.get("area"))
    usd = price if currency == "USD" else ""
    gel = price if currency == "GEL" else ""
    per_m2 = round(float(usd) / float(area), 2) if usd != "" and area not in ("", 0) else ""
    building = item.get("building") or {}
    position = building.get("position") or {}
    floors = item.get("floorNumbers") or []
    title = str(item.get("propertyTypeRoomCountLabel") or item.get("propertyTypeLabel") or "").strip()
    if building.get("name"):
        title = f"{title} — {building['name']}" if title else str(building["name"])
    return new_row(**{
        "Property ID": item.get("objectId"),
        "Link": BASE_URL + str(item.get("link") or ""),
        "Title": title,
        "Deal Type": DEALS.get(str(item.get("section") or ""), deal),
        "Property Type": str(item.get("propertyTypeLabel") or "ბინა"),
        "City": str((item.get("mainGeoObject") or {}).get("nominative") or ""),
        "Neighbourhood": str(item.get("subLocalityNominative") or ""),
        "Address": str(item.get("address") or building.get("address") or "").strip(),
        "Area m2": area,
        "Rooms": integer(item.get("roomCount")) or "",
        "Floor": integer(floors[0]) if floors else "",
        "Total Floors": integer((item.get("house") or {}).get("floorCount")),
        "Price USD": usd,
        "Price GEL": gel,
        "Price per m2 USD": per_m2,
        "Updated": iso(item.get("actualizeTime")),
        "Image": photo(item.get("mediaSrc")),
        "Lat": number(position.get("lat")),
        "Lng": number(position.get("lng")),
    })


def parse_list(session: requests.Session, page: int) -> list[dict[str, Any]]:
    # One "page" here is the same page number of the sale and the rent lists.
    rows: list[dict[str, Any]] = []
    for path, deal in LISTS:
        url = f"{BASE_URL}{path}?page={page}"
        state = page_state(get_html(session, url), url)
        items = (state.get("apartmentListingStore") or {}).get("apartments") or []
        rows += [row_from_item(item, deal) for item in items if item.get("objectId") and item.get("link")]
    return rows


def needs_detail(row: dict[str, Any]) -> bool:
    return row.get("Detail Status") != "done" or not row.get("Images")


def fetch_detail(session: requests.Session, row: dict[str, Any]) -> dict[str, Any]:
    url = str(row["Link"])
    state = page_state(get_html(session, url), url)
    layout = (state.get("layoutLandingStore") or {}).get("layout") or {}
    seller = (state.get("contactsStore") or {}).get("seller") or {}
    if not layout:
        raise ScraperError(f"korter.ge: no listing data at {url}")
    seller_type = str(seller.get("sellerType") or "")
    agency = seller.get("agency") or {}
    photos = [photo(image.get("mediaSrc")) for image in layout.get("images") or []]
    return {
        "Bedrooms": integer(layout.get("bedroomCount")) or "",
        "Bathrooms": integer(layout.get("bathroomCount")) or "",
        "Owner Type": SELLER_TYPES.get(seller_type, seller_type),
        "Owner Name": str(seller.get("name") or "").strip(),
        "Phone Number": join_phones(phone.get("displayNumber") for phone in seller.get("phones") or []),
        "Agency": str(agency.get("name") or "") if isinstance(agency, dict) else "",
        "Posted": iso(layout.get("publishTime") or layout.get("createTime")),
        "Updated": iso(layout.get("actualizeTime")) or row.get("Updated", ""),
        "Description": truncate(layout.get("description")),
        "Images": json.dumps([url for url in photos if url]),
        "Detail Status": "done",
    }
