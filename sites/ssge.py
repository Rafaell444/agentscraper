"""SS.ge adapter.  Result and detail pages embed JSON in ``__NEXT_DATA__``.

The unfiltered feed is ordered by ``orderDate`` (newest first).  The detail
page is read once per listing for the phone, contact name, owner type and
building details that the list card does not carry.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urljoin

import requests

from sites.common import (
    DEAL_DAILY,
    DEAL_MORTGAGE,
    DEAL_RENT,
    DEAL_SALE,
    OWNER_DEVELOPER,
    OWNER_PHYSICAL,
    OWNERS_ONLY,
    ScraperError,
    deal_from_title,
    get_html,
    integer,
    join_phones,
    new_row,
    next_data,
    normalize_id,
    number,
    polite_pause,
    rooms_from_title,
    truncate,
    type_from_title,
)

KEY = "ssge"
SHEET = "SS.ge"
BASE_URL = "https://home.ss.ge"
# Tbilisi (cityIdList=95), every poster, deal and property type.  OWNERS_ONLY=1
# narrows the feed to individual posters.
LIST_URL = BASE_URL + "/ka/udzravi-qoneba/l?cityIdList=95&page={page}"
OWNERS_LIST_URL = (
    BASE_URL + "/ka/udzravi-qoneba/l?cityIdList=95"
    "&advancedSearch=%7B%22individualEntityOnly%22%3Atrue%7D&page={page}"
)

DEAL_TYPES = {1: DEAL_RENT, 2: DEAL_MORTGAGE, 3: DEAL_DAILY, 4: DEAL_SALE}
PROPERTY_TYPES = {1: "აგარაკი", 4: "კერძო სახლი", 5: "ბინა", 6: "კომერციული ფართი"}
VIP_LABELS = {1: "VIP", 2: "VIP+", 3: "S-VIP"}
ENTITY_TYPES = {
    "Individual": OWNER_PHYSICAL,
    "Broker": "ბროკერი",
    "Agency": "სააგენტო",
    "Developer": OWNER_DEVELOPER,
    "Construction": "სამშენებლო კომპანია",
    "Company": "კომპანია",
}


def page_props(payload: dict[str, Any]) -> dict[str, Any]:
    props = payload.get("props", {}).get("pageProps", {})
    if not isinstance(props, dict):
        raise ScraperError("SS.ge pageProps is missing or malformed")
    return props


def extract_listing_records(payload: dict[str, Any]) -> list[dict[str, Any]]:
    listing = page_props(payload).get("applicationList", {})
    records = listing.get("realStateItemModel") if isinstance(listing, dict) else None
    if not isinstance(records, list):
        raise ScraperError("SS.ge applicationList.realStateItemModel was not found")
    return [record for record in records if isinstance(record, dict)]


def extract_detail_record(payload: dict[str, Any]) -> dict[str, Any]:
    record = page_props(payload).get("applicationData")
    if not isinstance(record, dict) or not record:
        raise ScraperError("SS.ge applicationData was not found")
    return record


def listing_link(record: dict[str, Any]) -> str:
    detail_url = str(record.get("detailUrl") or "").strip().strip("/")
    if detail_url:
        return urljoin(BASE_URL, f"/ka/udzravi-qoneba/{detail_url}")
    return urljoin(BASE_URL, f"/ka/udzravi-qoneba/{normalize_id(record.get('applicationId'))}")


def main_image(record: dict[str, Any]) -> str:
    images = [item for item in record.get("appImages") or [] if isinstance(item, dict)]
    for item in images:
        if item.get("isMain") and item.get("fileName"):
            return str(item["fileName"])
    return str(images[0]["fileName"]) if images and images[0].get("fileName") else ""


def row_from_record(record: dict[str, Any]) -> dict[str, Any]:
    address = record.get("address") or {}
    price = record.get("price") or {}
    title = str(record.get("title") or "").strip()
    street = " ".join(
        part for part in (address.get("streetTitle"), address.get("streetNumber")) if part
    ).strip()
    user_info = record.get("userInfo") or {}
    return new_row(**{
        "Property ID": record.get("applicationId"),
        "Link": listing_link(record),
        "Title": title,
        "Deal Type": DEAL_TYPES.get(record.get("dealType")) or deal_from_title(title),
        "Property Type": PROPERTY_TYPES.get(record.get("type")) or type_from_title(title),
        "City": address.get("cityTitle") or address.get("municipalityTitle") or "",
        "District": address.get("districtTitle") or "",
        "Neighbourhood": address.get("subdistrictTitle") or "",
        "Address": street,
        "Area m2": number(record.get("totalArea")),
        "Rooms": rooms_from_title(title),
        "Bedrooms": integer(record.get("numberOfBedrooms")) or "",
        "Floor": integer(record.get("floorNumber")),
        "Total Floors": integer(record.get("totalAmountOfFloor")),
        "Price USD": number(price.get("priceUsd")),
        "Price GEL": number(price.get("priceGeo")),
        "Price per m2 USD": number(price.get("unitPriceUsd")),
        "Agency": str(user_info.get("name") or "").strip() if isinstance(user_info, dict) else "",
        "VIP": VIP_LABELS.get(record.get("vipStatus"), ""),
        "Posted": str(record.get("createDate") or "")[:19],
        "Updated": str(record.get("orderDate") or "")[:19],
        "Description": truncate(record.get("description")),
        "Image": main_image(record),
    })


def parse_list(session: requests.Session, page: int) -> list[dict[str, Any]]:
    url = (OWNERS_LIST_URL if OWNERS_ONLY else LIST_URL).format(page=page)
    records = extract_listing_records(next_data(get_html(session, url), url))
    return [row_from_record(record) for record in records if record.get("applicationId")]


def needs_detail(row: dict[str, Any]) -> bool:
    return row.get("Detail Status") != "done"


def fetch_detail(session: requests.Session, row: dict[str, Any]) -> dict[str, Any]:
    polite_pause()
    url = str(row["Link"])
    detail = extract_detail_record(next_data(get_html(session, url), url))
    entity = str(detail.get("userEntityType") or "").strip()
    phones = [
        item.get("phoneNumber")
        for item in detail.get("applicationPhones") or []
        if isinstance(item, dict)
    ]
    return {
        "Owner Type": ENTITY_TYPES.get(entity, entity),
        "Owner Name": str(detail.get("contactPerson") or "").strip(),
        "Phone Number": join_phones(phones),
        "Agency": str(detail.get("agencyName") or detail.get("companyName") or "").strip(),
        # Deal and property type keep the list-page labels so every row uses the same wording.
        "Status": str(detail.get("realEstateStatus") or "").strip(),
        "Condition": str(detail.get("state") or "").strip(),
        "Rooms": integer(detail.get("rooms")),
        "Bedrooms": integer(detail.get("bedrooms")),
        "Bathrooms": integer(detail.get("toilet")),
        "Floor": integer(detail.get("floor")),
        "Total Floors": integer(detail.get("floors")),
        "Area m2": number(detail.get("totalArea")),
        "Yard Area m2": number(detail.get("areaOfYard")),
        "Description": truncate(detail.get("description")),
    }
