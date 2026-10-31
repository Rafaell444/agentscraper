"""avezor.ge adapter (agency).

The site's browser app loads its listings from a public data API (the same
requests any visitor's browser makes), newest first, with every field and
photo in one answer, so no detail page is read.  Avezor shows only its own
office number, never the seller's; a number written in the description is
kept.
"""

from __future__ import annotations

import json
from typing import Any

import requests

from sites.common import (
    DEAL_RENT,
    DEAL_SALE,
    ScraperError,
    integer,
    new_row,
    number,
    phones_in_text,
    truncate,
)

KEY = "avezor"
SHEET = "avezor.ge"
BASE_URL = "https://avezor.ge"
API_URL = "https://api.avezor.ge/properties"
PAGE_SIZE = 40
REQUEST_DELAY = 0.6

DEALS = (("buy", DEAL_SALE), ("rent", DEAL_RENT))
PROPERTY_TYPES = {
    "apartment": "ბინა",
    "house": "კერძო სახლი",
    "commercial": "კომერციული ფართი",
    "land": "მიწის ნაკვეთი",
}
PLACES = {
    "vake-saburtalo": "ვაკე-საბურთალო", "gldani-nadzaladevi": "გლდანი-ნაძალადევი",
    "isani-samgori": "ისანი-სამგორი", "didube-chugureti": "დიდუბე-ჩუღურეთი",
    "old tbilisi": "ძველი თბილისი", "vake": "ვაკე", "saburtalo": "საბურთალო",
    "mtatsminda": "მთაწმინდა", "sololaki": "სოლოლაკი", "vera": "ვერა", "didube": "დიდუბე",
    "isani": "ისანი", "samgori": "სამგორი", "varketili": "ვარკეთილი", "gldani": "გლდანი",
    "nadzaladevi": "ნაძალადევი", "chugureti": "ჩუღურეთი", "avlabari": "ავლაბარი",
    "digomi": "დიღომი 1-9", "didi digomi": "დიდი დიღომი", "vashlijvari": "ვაშლიჯვარი",
    "tskneti": "წყნეთი", "krtsanisi": "კრწანისი", "ortachala": "ორთაჭალა", "bagebi": "ბაგები",
    "lisi": "ლისი", "vazisubani": "ვაზისუბანი", "temka": "თემქა", "mukhiani": "მუხიანი",
    "nutsubidze plateau": "ნუცუბიძის ფერდობი", "vake-bagebi": "ბაგები", "dighomi": "დიღომი 1-9",
    "didi dighomi": "დიდი დიღომი", "lilo": "ლილო", "zahesi": "ზაჰესი", "nadzaladevi district": "ნაძალადევი",
}


def place(value: Any) -> str:
    text = str(value or "").strip()
    return PLACES.get(text.lower(), text)


def iso(value: Any) -> str:
    text = str(value or "")
    return text[:19].replace("T", " ") if text else ""


def photo_url(image: dict[str, Any]) -> str:
    sizes = {entry.get("type"): entry.get("url") for entry in image.get("populated") or [] if entry.get("format") == "jpeg"}
    return str(sizes.get("large") or sizes.get("desktop") or sizes.get("original") or "")


def georgian(record: dict[str, Any], field: str) -> str:
    for translation in record.get("translations") or []:
        if translation.get("language") == "ka" and translation.get(field):
            return str(translation[field])
    return str(record.get(field) or "")


def row_from_record(record: dict[str, Any], deal: str) -> dict[str, Any]:
    pricing = record.get("pricing") or {}
    converted = pricing.get("convertedPrices") or {}
    per_m2 = (pricing.get("convertedPricesPerSqM") or {}).get("USD")
    images = sorted(record.get("images") or [], key=lambda image: (not image.get("isPrimary"), image.get("order") or 0))
    photos = [url for url in (photo_url(image) for image in images) if url]
    description = georgian(record, "description")
    street = record.get("street") or {}
    object_type = str(record.get("objectType") or "")
    return new_row(**{
        "Property ID": record.get("customId") or record.get("id"),
        "Link": f"{BASE_URL}/{record.get('dealType') or 'buy'}/{record.get('slug')}/",
        "Title": georgian(record, "title").strip(),
        "Deal Type": deal,
        "Property Type": PROPERTY_TYPES.get(object_type, object_type),
        "Condition": str(record.get("frame") or ""),
        "City": "თბილისი" if str(record.get("city") or "").lower() == "tbilisi" else str(record.get("city") or ""),
        "District": place(record.get("district")),
        "Neighbourhood": place(record.get("microdistrict") or record.get("district")),
        "Address": str(street.get("ka") or street.get("en") or "") if isinstance(street, dict) else str(street or ""),
        "Area m2": number(record.get("area")),
        "Yard Area m2": number(record.get("landArea")),
        "Rooms": integer(record.get("rooms")) or "",
        "Bedrooms": integer(record.get("bedrooms")) or "",
        "Floor": integer(record.get("floor")),
        "Total Floors": integer(record.get("floors")),
        "Price USD": number(converted.get("USD")),
        "Price GEL": number(converted.get("GEL")),
        "Price per m2 USD": number(per_m2),
        "Owner Type": "სააგენტო",
        "Phone Number": phones_in_text(description),
        "Agency": "Avezor",
        "Posted": iso(record.get("createdAt")),
        "Updated": iso(record.get("updatedAt")),
        "Description": truncate(description),
        "Image": photos[0] if photos else "",
        "Images": json.dumps(photos),
        "Detail Status": "done",
    })


def parse_list(session: requests.Session, page: int) -> list[dict[str, Any]]:
    # One "page" here is the same page number of the sale and the rent lists.
    rows: list[dict[str, Any]] = []
    for deal_type, deal in DEALS:
        response = session.get(
            API_URL,
            params={
                "page": str(page),
                "limit": str(PAGE_SIZE),
                "dealType": deal_type,
                "objectType[]": "apartment",
                "city[]": "Tbilisi",
                "language": "ka",
                "sortBy": "createdAt",
                "sortOrder": "desc",
            },
            headers={"Accept": "application/json", "Origin": BASE_URL, "Referer": BASE_URL + "/"},
            timeout=(10, 35),
        )
        if response.status_code != 200:
            raise ScraperError(f"avezor.ge data API HTTP {response.status_code}")
        records = (response.json() or {}).get("data")
        if not isinstance(records, list):
            raise ScraperError("avezor.ge data API returned no list")
        rows += [row_from_record(record, deal) for record in records if record.get("slug")]
    return rows


def needs_detail(row: dict[str, Any]) -> bool:
    return False


def fetch_detail(session: requests.Session, row: dict[str, Any]) -> dict[str, Any]:
    return {}
