"""rentals.ge adapter (agency site aimed at expats).

The site is a browser app that loads its listings from a public data API
(the same requests any visitor's browser makes).  The API address and the
public key are read from the site's own script at run time, so nothing
site-specific is hard-coded here beyond field names.
"""

from __future__ import annotations

import re
from typing import Any

import requests

from sites.common import (
    DEAL_RENT,
    DEAL_SALE,
    ScraperError,
    get_html,
    integer,
    join_phones,
    new_row,
    number,
    truncate,
)

KEY = "rentals"
SHEET = "rentals.ge"
BASE_URL = "https://rentals.ge"
PAGE_SIZE = 50
REQUEST_DELAY = 0.6

FIELDS = (
    "id,external_id,slug,title,title_ka,description,price,currency,sale_price,sale_currency,"
    "transaction_type,property_type,district,subdistrict,street,address_text,city,rooms,bedrooms,"
    "bathrooms,area_m2,land_area_m2,floor,total_floors,condition,building_type,cover_photo_url,"
    "created_at,updated_at,submit_date,contact_name,contact_full_name,contact_phone,contact_mobile,is_vip"
)
DEAL_TYPES = {"rent": DEAL_RENT, "sale": DEAL_SALE, "both": DEAL_RENT}
PROPERTY_TYPES = {
    "apartment": "ბინა",
    "house": "კერძო სახლი",
    "townhouse": "კერძო სახლი",
    "villa": "კერძო სახლი",
    "commercial": "კომერციული ფართი",
    "office": "კომერციული ფართი",
    "building": "კომერციული ფართი",
    "land": "მიწის ნაკვეთი",
}
PLACES = {
    "vake": "ვაკე", "saburtalo": "საბურთალო", "mtatsminda": "მთაწმინდა", "sololaki": "სოლოლაკი",
    "vera": "ვერა", "old tbilisi": "ძველი თბილისი", "didube": "დიდუბე", "isani": "ისანი",
    "samgori": "სამგორი", "varketili": "ვარკეთილი", "gldani": "გლდანი", "nadzaladevi": "ნაძალადევი",
    "chugureti": "ჩუღურეთი", "avlabari": "ავლაბარი", "digomi": "დიღომი 1-9", "didi digomi": "დიდი დიღომი",
    "vashlijvari": "ვაშლიჯვარი", "tskneti": "წყნეთი", "krtsanisi": "კრწანისი", "ortachala": "ორთაჭალა",
    "bagebi": "ბაგები", "lisi": "ლისი", "vazisubani": "ვაზისუბანი", "temka": "თემქა", "mukhiani": "მუხიანი",
}
_api: tuple[str, str] | None = None


def discover_api(session: requests.Session) -> tuple[str, str]:
    """Find the data API base URL and public key in the site's script bundle."""
    global _api
    if _api:
        return _api
    home = get_html(session, BASE_URL + "/")
    match = re.search(r"/assets/index-[A-Za-z0-9_\-]+\.js", home)
    if not match:
        raise ScraperError("rentals.ge: main script not found")
    response = session.get(BASE_URL + match.group(0), timeout=(10, 35))
    if response.status_code != 200:
        raise ScraperError(f"rentals.ge: script HTTP {response.status_code}")
    script = response.text
    url = re.search(r"https://[a-z0-9]+\.supabase\.co", script)
    key = re.search(r"eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+", script)
    if not url or not key:
        raise ScraperError("rentals.ge: data API address not found in script")
    _api = (url.group(0), key.group(0))
    return _api


def place(value: Any) -> str:
    text = str(value or "").strip()
    return PLACES.get(text.lower(), text)


def city(value: Any) -> str:
    text = str(value or "").strip()
    return "თბილისი" if "tbilisi" in text.lower() or "თბილისი" in text else text


def link(record: dict[str, Any]) -> str:
    ref = record.get("external_id") or record.get("slug") or record.get("id")
    return f"{BASE_URL}/property/{ref}"


def iso(value: Any) -> str:
    text = str(value or "")
    return text[:19].replace("T", " ") if text else ""


def row_from_record(record: dict[str, Any]) -> dict[str, Any]:
    deal = DEAL_TYPES.get(str(record.get("transaction_type") or ""), str(record.get("transaction_type") or ""))
    currency = str(record.get("currency") or "USD").upper()
    price = number(record.get("price"))
    area = number(record.get("area_m2"))
    usd = price if currency == "USD" else ""
    gel = price if currency == "GEL" else ""
    per_m2 = round(float(usd) / float(area), 2) if usd != "" and area not in ("", 0) else ""
    neighbourhood = place(record.get("subdistrict") or record.get("district"))
    phones = join_phones([record.get("contact_phone"), record.get("contact_mobile")])
    return new_row(**{
        "Property ID": record.get("external_id") or record.get("id"),
        "Link": link(record),
        "Title": str(record.get("title_ka") or record.get("title") or "").strip(),
        "Deal Type": deal,
        "Property Type": PROPERTY_TYPES.get(str(record.get("property_type") or ""), str(record.get("property_type") or "")),
        "Condition": str(record.get("condition") or ""),
        "Status": str(record.get("building_type") or ""),
        "City": city(record.get("city")),
        "Neighbourhood": neighbourhood,
        "Address": str(record.get("address_text") or record.get("street") or "").strip(),
        "Area m2": area,
        "Yard Area m2": number(record.get("land_area_m2")),
        "Rooms": integer(record.get("rooms")) or "",
        "Bedrooms": integer(record.get("bedrooms")) or "",
        "Bathrooms": integer(record.get("bathrooms")) or "",
        "Floor": integer(record.get("floor")),
        "Total Floors": integer(record.get("total_floors")),
        "Price USD": usd,
        "Price GEL": gel,
        "Price per m2 USD": per_m2,
        "Owner Type": "სააგენტო",
        "Owner Name": str(record.get("contact_full_name") or record.get("contact_name") or "").strip(),
        "Phone Number": phones,
        "Agency": "RENTALS.ge",
        "VIP": "VIP" if record.get("is_vip") else "",
        "Posted": iso(record.get("submit_date") or record.get("created_at")),
        "Updated": iso(record.get("updated_at")),
        "Description": truncate(record.get("description")),
        "Image": str(record.get("cover_photo_url") or ""),
        "Detail Status": "done",
    })


def parse_list(session: requests.Session, page: int) -> list[dict[str, Any]]:
    api_url, key = discover_api(session)
    response = session.get(
        f"{api_url}/rest/v1/live_listings",
        params={
            "select": FIELDS,
            "in_main": "eq.true",
            "order": "created_at.desc",
            "offset": str((page - 1) * PAGE_SIZE),
            "limit": str(PAGE_SIZE),
        },
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"},
        timeout=(10, 35),
    )
    if response.status_code != 200:
        raise ScraperError(f"rentals.ge data API HTTP {response.status_code}")
    records = response.json()
    if not isinstance(records, list):
        raise ScraperError("rentals.ge data API returned no list")
    return [row_from_record(record) for record in records if record.get("id")]


def needs_detail(row: dict[str, Any]) -> bool:
    return False


def fetch_detail(session: requests.Session, row: dict[str, Any]) -> dict[str, Any]:
    return {}
