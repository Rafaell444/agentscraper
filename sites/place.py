"""place.ge adapter.  Server-rendered list cards carry almost every field,
including the full phone number and whether the poster is an owner or agent.
The detail page adds bedrooms, bathrooms and the seller's description.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup, Tag

from sites.common import (
    OWNER_AGENT,
    OWNER_DEVELOPER,
    OWNER_PHYSICAL,
    clean_phone,
    get_soup,
    integer,
    join_phones,
    labelled_values,
    new_row,
    number,
    polite_pause,
    split_floor,
    truncate,
)

KEY = "place"
SHEET = "place.ge"
BASE_URL = "https://place.ge"
# The list defaults to flats, so every object type is read separately.
LIST_URL = BASE_URL + "/ge/ads/page:{page}?mode=list&order_by=date&limit=100&object_type={object_type}"
OBJECT_TYPES = ("flat", "private_house", "summer_house", "land", "commercial_estate")
ROLES = {
    "მესაკუთრე": OWNER_PHYSICAL,
    "მეპატრონე": OWNER_PHYSICAL,
    "აგენტი": OWNER_AGENT,
    "დეველოპერი": OWNER_DEVELOPER,
    "სააგენტო": "სააგენტო",
}


def iso_date(text: str) -> str:
    match = re.search(r"(\d{2})\.(\d{2})\.(\d{4})", text or "")
    return f"{match.group(3)}-{match.group(2)}-{match.group(1)}" if match else ""


def parse_price(text: str) -> tuple[float | str, float | str]:
    """``$395,000 / $2,724 კვ.მ.`` -> (395000, 2724); ``$81 / დღეში`` -> (81, '')."""
    parts = [part.strip() for part in (text or "").split("/")]
    total = number(parts[0]) if parts else ""
    per_m2 = number(parts[1]) if len(parts) > 1 and "კვ" in parts[1] else ""
    return total, per_m2


def parse_contact(text: str) -> tuple[str, str, str]:
    """``579972707, 579972707, ზვიადი, აგენტი`` -> (phones, name, owner type)."""
    tokens = [token.strip() for token in re.sub(r"^ტელ\.?:\s*", "", text or "").split(",")]
    phones = [token for token in tokens if clean_phone(token)]
    others = [token for token in tokens if token and token not in phones]
    role = ""
    if others and others[-1] in ROLES:
        role = ROLES[others.pop()]
    return join_phones(phones), ", ".join(others), role


def parse_card(card: Tag) -> dict[str, Any] | None:
    link = card.select_one("a[href*='/ge/ads/view/']")
    if link is None:
        return None
    match = re.search(r"/ge/ads/view/(\d+)", link["href"])
    if not match:
        return None
    property_id = match.group(1)
    info = card.select_one("div.infoFilter")
    if info is None:
        return None

    summary_div = next((div for div in info.find_all("div", recursive=False) if div.find("strong")), None)
    summary_lines: list[str] = []
    if summary_div is not None:
        for br in summary_div.find_all("br"):
            br.replace_with("\n")
        summary_lines = [line.strip() for line in summary_div.get_text("").split("\n") if line.strip()]
    summary = summary_lines[0] if summary_lines else ""
    location = summary_lines[1] if len(summary_lines) > 1 else ""

    deal = property_type = ""
    rooms: int | str = ""
    area: float | str = ""
    floor: int | str = ""
    total_floors: int | str = ""
    for index, token in enumerate(part.strip() for part in summary.split(",")):
        if index == 0:
            deal = token
        elif index == 1:
            property_type = token
        elif "ოთახ" in token:
            rooms = integer(token)
        elif "კვ.მ" in token:
            area = number(token)
        elif "სართული" in token:
            floor, total_floors = split_floor(token.replace("სართული", ""))

    place_parts = [part.strip() for part in location.split(",") if part.strip()]
    city = place_parts[0] if place_parts else ""
    neighbourhood = place_parts[1] if len(place_parts) >= 3 else ""
    address = ", ".join(place_parts[2:]) if len(place_parts) >= 3 else (place_parts[1] if len(place_parts) == 2 else "")

    price_span = card.select_one("span.price")
    usd, per_m2 = parse_price(price_span.get("data-price_usd", "") if price_span else "")
    gel, _ = parse_price(price_span.get("data-price_lari", "") if price_span else "")

    contact_div = next((div for div in info.find_all("div") if div.get_text(strip=True).startswith("ტელ")), None)
    phones, owner_name, owner_type = parse_contact(contact_div.get_text(" ", strip=True) if contact_div else "")
    agency_link = card.select_one("a[href^='/ge/a/']")
    pub_date = card.select_one("span.pub-date")
    image = card.select_one("div.img img")

    labels = []
    if "vip-ad" in (card.get("class") or []):
        labels.append("VIP")
    if card.select_one("div.quickly"):
        labels.append("სასწრაფოდ")

    return new_row(**{
        "Property ID": property_id,
        "Link": urljoin(BASE_URL, f"/ge/ads/view/{property_id}"),
        "Title": "; ".join(line for line in (summary, location) if line),
        "Deal Type": deal,
        "Property Type": property_type,
        "City": city,
        "Neighbourhood": neighbourhood,
        "Address": address,
        "Area m2": area,
        "Rooms": rooms,
        "Floor": floor,
        "Total Floors": total_floors,
        "Price USD": usd,
        "Price GEL": gel,
        "Price per m2 USD": per_m2,
        "Owner Type": owner_type,
        "Owner Name": owner_name,
        "Phone Number": phones,
        "Agency": agency_link.get_text(strip=True) if agency_link else "",
        "VIP": "; ".join(labels),
        "Posted": iso_date(pub_date.get_text(" ", strip=True) if pub_date else ""),
        "Image": image.get("src", "") if image else "",
    })


def parse_list(session: requests.Session, page: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, object_type in enumerate(OBJECT_TYPES):
        if index:
            polite_pause()
        soup = get_soup(session, LIST_URL.format(page=page, object_type=object_type))
        for card in soup.select("div.tr-line"):
            row = parse_card(card)
            if row and row["Property ID"] not in seen:
                seen.add(row["Property ID"])
                rows.append(row)
    return rows


def needs_detail(row: dict[str, Any]) -> bool:
    return row.get("Detail Status") != "done"


def fetch_detail(session: requests.Session, row: dict[str, Any]) -> dict[str, Any]:
    polite_pause()
    soup: BeautifulSoup = get_soup(session, str(row["Link"]))
    parts = [part.strip() for part in soup.get_text(" | ", strip=True).split(" | ")]
    values = labelled_values(parts, ("საძინებელი", "სველი წერტილი", "მისამართი", "ფართი", "ოთახი"))
    update: dict[str, Any] = {
        "Bedrooms": integer(values.get("საძინებელი")),
        "Bathrooms": integer(values.get("სველი წერტილი")),
    }
    address_parts = [part.strip() for part in values.get("მისამართი", "").split(",") if part.strip()]
    if len(address_parts) >= 4:
        update["City"], update["District"], update["Neighbourhood"] = address_parts[:3]
        update["Address"] = ", ".join(address_parts[3:])
    try:
        start = parts.index("დამატებითი ინფორმაცია გამყიდველისაგან:") + 1
        end = next((index for index in range(start, len(parts)) if parts[index] == "მსგავსი განცხადებები"), start + 1)
        update["Description"] = truncate(" ".join(parts[start:end]))
    except ValueError:
        pass
    return update
