"""binebi.ge adapter.  Server-rendered cards (newest first with ``sort=id,desc``)
carry price, area, floor and the poster's name; the detail page adds the full
phone number, owner/agent role, condition and building details.
"""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urljoin

import requests
from bs4 import Tag

from sites.common import (
    OWNER_AGENT,
    OWNER_DEVELOPER,
    OWNER_PHYSICAL,
    clean_phone,
    deal_from_title,
    get_soup,
    integer,
    labelled_values,
    new_row,
    number,
    polite_pause,
    split_floor,
    truncate,
    type_from_title,
)

KEY = "binebi"
SHEET = "binebi.ge"
BASE_URL = "https://binebi.ge"
# city=1 is Tbilisi.  The site has no owner filter; the detail page tells
# owners (მესაკუთრე) from agents and the collector drops the agents.
LIST_URL = BASE_URL + "/gancxadebebi?city=1&sort=id%2Cdesc&page={page}"
SITE_PHONES = {"322800015"}
ROLES = {
    "მესაკუთრე": OWNER_PHYSICAL,
    "მეპატრონე": OWNER_PHYSICAL,
    "აგენტი": OWNER_AGENT,
    "დეველოპერი": OWNER_DEVELOPER,
    "სააგენტო": "სააგენტო",
    "კომპანია": "კომპანია",
}
MONTHS = {
    "იანვარი": 1, "თებერვალი": 2, "მარტი": 3, "აპრილი": 4, "მაისი": 5, "ივნისი": 6,
    "ივლისი": 7, "აგვისტო": 8, "სექტემბერი": 9, "ოქტომბერი": 10, "ნოემბერი": 11, "დეკემბერი": 12,
}


def iso_date(text: str) -> str:
    match = re.search(r"(\d{1,2})\s+(\S+)\s+(\d{4})", text or "")
    if not match or match.group(2) not in MONTHS:
        return ""
    return f"{match.group(3)}-{MONTHS[match.group(2)]:02d}-{int(match.group(1)):02d}"


def spec_values(container: Tag | None) -> dict[str, str]:
    values: dict[str, str] = {}
    if container is None:
        return values
    for item in container.select("li[title]"):
        values[item["title"].strip()] = item.get_text(" ", strip=True)
    return values


def parse_card(card: Tag) -> dict[str, Any] | None:
    property_id = str(card.get("data-id") or "").strip()
    title_link = card.select_one(".ui-card__title a[href]")
    if not property_id or title_link is None:
        return None
    title = title_link.get_text(" ", strip=True)
    address_el = card.select_one(".ui-card__address span")
    address_parts = [part.strip() for part in (address_el.get_text(" ", strip=True) if address_el else "").split(",") if part.strip()]
    specs = spec_values(card.select_one("ul.ui-specs"))
    floor, total_floors = split_floor(specs.get("სართული", ""))
    price_el = card.select_one(".price[data-price]")
    date_el = card.select_one(".ui-card__date")
    desc_el = card.select_one(".ui-card__desc")
    user_el = card.select_one(".ui-card__user")
    vip_el = card.select_one(".ui-vip span")
    image = card.select_one(".ui-card__image img")
    return new_row(**{
        "Property ID": property_id,
        "Link": urljoin(BASE_URL + "/", title_link["href"]),
        "Title": title,
        "Deal Type": deal_from_title(title),
        "Property Type": type_from_title(title),
        "City": address_parts[0] if address_parts else "",
        "Neighbourhood": address_parts[1] if len(address_parts) >= 3 else "",
        "Address": ", ".join(address_parts[2:]) if len(address_parts) >= 3 else ", ".join(address_parts[1:]),
        "Area m2": number(specs.get("ფართი")),
        "Rooms": integer(specs.get("ოთახები")),
        "Bedrooms": integer(specs.get("საძინებელი")),
        "Floor": floor,
        "Total Floors": total_floors,
        "Price GEL": number(price_el.get("data-price")) if price_el else "",
        "Owner Name": user_el.get_text(" ", strip=True) if user_el else "",
        "VIP": vip_el.get_text(" ", strip=True) if vip_el else "",
        "Posted": iso_date(date_el.get_text(" ", strip=True) if date_el else ""),
        "Description": truncate(desc_el.get_text(" ", strip=True) if desc_el else ""),
        "Image": image.get("src", "") if image else "",
    })


def parse_list(session: requests.Session, page: int) -> list[dict[str, Any]]:
    soup = get_soup(session, LIST_URL.format(page=page))
    rows = []
    for card in soup.select("article.list-item[data-id]"):
        row = parse_card(card)
        if row:
            rows.append(row)
    return rows


def needs_detail(row: dict[str, Any]) -> bool:
    # Rows read before photos/map were stored are read once more.
    return row.get("Detail Status") != "done" or not row.get("Images")


def breadcrumbs(soup: Tag) -> list[str]:
    for node in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(node.string or "")
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict) and data.get("@type") == "BreadcrumbList":
            items = sorted(data.get("itemListElement", []), key=lambda item: item.get("position", 0))
            return [str(item.get("name") or "").strip() for item in items]
    return []


def fetch_detail(session: requests.Session, row: dict[str, Any]) -> dict[str, Any]:
    polite_pause()
    soup = get_soup(session, str(row["Link"]))
    parts = [part.strip() for part in soup.get_text(" | ", strip=True).split(" | ")]
    values = labelled_values(
        parts, ("მდგომარეობა", "სტატუსი", "ოთახები", "საძინებელი", "სველი წერტილი", "ფართი", "სართული", "პროექტი"),
    )
    phones = [
        clean_phone(link["href"].replace("tel:", ""))
        for link in soup.find_all("a", href=re.compile(r"^tel:"))
    ]
    phones = [phone for phone in phones if phone and phone not in SITE_PHONES]
    who = soup.select_one(".ui-contact__who")
    owner_name, owner_type = "", ""
    if who is not None:
        tokens = who.get_text(" ", strip=True).split()
        if tokens and tokens[-1] in ROLES:
            owner_type = ROLES[tokens.pop()]
        owner_name = " ".join(tokens)
    crumbs = breadcrumbs(soup)
    floor, total_floors = split_floor(values.get("სართული", "").replace(" ", ""))
    description = ""
    if "აღწერა" in parts:
        start = parts.index("აღწერა") + 1
        end = next((index for index in range(start, len(parts)) if parts[index] in ("სრული აღწერა", "დამატებითი პარამეტრები")), start)
        description = truncate(" ".join(parts[start:end]))
    update = {
        "Phone Number": "; ".join(dict.fromkeys(phones)),
        "Owner Name": owner_name,
        "Owner Type": owner_type,
        "Condition": values.get("მდგომარეობა", ""),
        "Status": values.get("სტატუსი", ""),
        "Rooms": integer(values.get("ოთახები")),
        "Bedrooms": integer(values.get("საძინებელი")),
        "Bathrooms": integer(values.get("სველი წერტილი")),
        "Area m2": number(values.get("ფართი")),
        "Floor": floor,
        "Total Floors": total_floors,
        "Description": description,
    }
    # Map point from the page script (var map_lat = '41.7'; var map_lon = '44.8';)
    # and the gallery on the CDN (thumbnails skipped).
    html = str(soup)
    lat = re.search(r"map_lat\s*=\s*'(-?[\d.]+)'", html)
    lng = re.search(r"map_lon\s*=\s*'(-?[\d.]+)'", html)
    update["Lat"] = number(lat.group(1)) if lat else ""
    update["Lng"] = number(lng.group(1)) if lng else ""
    photos = re.findall(r"https://cdn\.binebi\.ge/uploads/homes/" + re.escape(str(row["Property ID"])) + r"/[^\"'\s)]+\.(?:jpe?g|png|webp)", html)
    update["Images"] = json.dumps([url for url in dict.fromkeys(photos) if "/thumbnail/" not in url][:30])
    if len(crumbs) >= 4:
        update["Deal Type"] = crumbs[1]
        update["City"] = crumbs[3]
    return update
