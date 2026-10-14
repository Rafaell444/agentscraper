"""housing.ge adapter.  The list page (newest first) shows title, area,
bedrooms, price and a short description; the detail page adds the phone,
contact name, bathrooms and the full description.
"""

from __future__ import annotations

import re
from typing import Any

import requests
from bs4 import Tag

from sites.common import (
    clean_phone,
    deal_from_title,
    get_soup,
    integer,
    new_row,
    number,
    polite_pause,
    truncate,
    type_from_title,
)

KEY = "housing"
SHEET = "housing.ge"
BASE_URL = "https://housing.ge"
LIST_URL = BASE_URL + "/udzravi-qoneba?page={page}"
# housing.ge answers HTTP 429 when detail pages are read faster than this.
REQUEST_DELAY = 2.0
CURRENCY_COLUMNS = {"$": "Price USD", "₾": "Price GEL"}


def price_fields(text: str) -> dict[str, Any]:
    value = number(text)
    if value == "":
        return {}
    for symbol, column in CURRENCY_COLUMNS.items():
        if symbol in text:
            return {column: value}
    return {}


def split_title(title: str) -> tuple[str, str, str]:
    """``იყიდება სახლი/აგარაკი - ოქროყანა, თბილისი`` -> (kind, neighbourhood, city)."""
    kind, _, location = title.partition(" - ")
    place_parts = [part.strip() for part in location.split(",") if part.strip()]
    city = place_parts[-1] if place_parts else ""
    neighbourhood = ", ".join(place_parts[:-1])
    return kind.strip(), neighbourhood, city


def parse_card(holder: Tag) -> dict[str, Any] | None:
    href = str(holder.get("href") or "")
    match = re.search(r"-(\d+)/?$", href)
    if not match:
        return None
    headline = holder.select_one(".headline")
    title = headline.get_text(" ", strip=True) if headline else ""
    kind, neighbourhood, city = split_title(title)
    area: float | str = ""
    bedrooms: int | str = ""
    for span in holder.select(".details .more span"):
        text = span.get_text(" ", strip=True)
        if "㎡" in text or "მ²" in text:
            area = number(text)
        elif integer(text) != "" and integer(text) <= 30:
            bedrooms = integer(text)
    description = holder.select_one(".description")
    price = holder.select_one(".price")
    media = holder.find_previous_sibling("div")
    vip = media.select_one(".vip-icon") if media else None
    image = media.select_one("img[data-src]") if media else None
    row = new_row(**{
        "Property ID": match.group(1),
        "Link": href,
        "Title": title,
        "Deal Type": deal_from_title(kind),
        "Property Type": type_from_title(kind),
        "City": city,
        "Neighbourhood": neighbourhood,
        "Area m2": area,
        "Bedrooms": bedrooms,
        "VIP": vip.get_text(" ", strip=True) if vip else "",
        "Description": truncate(description.get_text(" ", strip=True) if description else ""),
        "Image": image.get("data-src", "") if image else "",
    })
    row.update(price_fields(price.get_text(" ", strip=True) if price else ""))
    return row


def parse_list(session: requests.Session, page: int) -> list[dict[str, Any]]:
    soup = get_soup(session, LIST_URL.format(page=page))
    rows = []
    for holder in soup.select("a.item-holder[href*='/udzravi-qoneba/']"):
        row = parse_card(holder)
        if row:
            rows.append(row)
    return rows


def needs_detail(row: dict[str, Any]) -> bool:
    return row.get("Detail Status") != "done"


def fetch_detail(session: requests.Session, row: dict[str, Any]) -> dict[str, Any]:
    polite_pause()
    soup = get_soup(session, str(row["Link"]))
    text = soup.get_text(" | ", strip=True)
    parts = [part.strip() for part in text.split(" | ")]
    phones = [
        clean_phone(link["href"].replace("tel:", ""))
        for link in soup.find_all("a", href=re.compile(r"^tel:"))
    ]
    phones = [phone for phone in phones if phone]
    update: dict[str, Any] = {"Phone Number": "; ".join(dict.fromkeys(phones))}

    bathrooms = re.search(r"(\d+)\s*სველი წერტილი", text)
    if bathrooms:
        update["Bathrooms"] = int(bathrooms.group(1))
    cadastral = re.search(r"საკადასტრო კოდი:\s*([\d.]+)", text)
    if cadastral:
        update["Address"] = f"საკადასტრო კოდი {cadastral.group(1)}"

    # The contact panel lists currency toggles, the price and then the name.
    contact = soup.select_one("[class*=contact]")
    if contact is not None:
        for token in contact.stripped_strings:
            token = token.strip()
            if token and token not in {"$", "€", "₾"} and number(token) == "" and not token.isdigit():
                update["Owner Name"] = token
                break
    if "აღწერა" in parts:
        start = parts.index("აღწერა") + 1
        end = next(
            (index for index in range(start, len(parts)) if parts[index].startswith("საუბრის დაწყებისას") or parts[index] == "დამატებითი ინფორმაცია"),
            start,
        )
        update["Description"] = truncate(" ".join(parts[start:end]))
    return update
