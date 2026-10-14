"""makler.ge adapter.  Category pages are server-rendered and list the newest
ads first.  The site's robots.txt disallows the ``?limitstart=`` pagination
URLs, so only the first page of each category is read on every run; the
detail page supplies the realtor's direct phone, status and condition.
"""

from __future__ import annotations

import re
from typing import Any

import requests
from bs4 import Tag

from sites.common import (
    DEAL_RENT,
    DEAL_SALE,
    clean_phone,
    get_soup,
    integer,
    labelled_values,
    new_row,
    number,
    polite_pause,
    truncate,
)

KEY = "makler"
SHEET = "makler.ge"
BASE_URL = "https://www.makler.ge"
AGENCY_PHONES = {"322471020", "599428844"}
# makler.ge is a small server; detail pages time out when hit too quickly.
REQUEST_DELAY = 1.0
CATEGORIES = (
    ("iyideba/bina", DEAL_SALE, "ბინა"),
    ("iyideba/sakuthari-saxli", DEAL_SALE, "კერძო სახლი"),
    ("iyideba/komerciuli-pharthi", DEAL_SALE, "კომერციული ფართი"),
    ("iyideba/ophisi", DEAL_SALE, "კომერციული ფართი"),
    ("iyideba/agaraki", DEAL_SALE, "აგარაკი"),
    ("iyideba/mitsa", DEAL_SALE, "მიწის ნაკვეთი"),
    ("qiravdeba/bina", DEAL_RENT, "ბინა"),
    ("qiravdeba/sakuthari-saxli", DEAL_RENT, "კერძო სახლი"),
    ("qiravdeba/komerciuli-pharthi", DEAL_RENT, "კომერციული ფართი"),
    ("qiravdeba/ophisi", DEAL_RENT, "კომერციული ფართი"),
    ("qiravdeba/agaraki", DEAL_RENT, "აგარაკი"),
)


VOWELS = set("აეიოუ")


def neighbourhood_from_title(title: str) -> str:
    """``იყიდება 2 ოთახიანი ბინა საბურთალოზე`` -> ``საბურთალო`` (locative stripped)."""
    words = str(title or "").split()
    if not words:
        return ""
    word = words[-1]
    for suffix in ("ზე", "ში"):
        if word.endswith(suffix) and len(word) > len(suffix) + 2:
            stem = word[: -len(suffix)]
            return stem if stem[-1] in VOWELS else stem + "ი"
    return ""


def first_price(card: Tag, currency: str) -> tuple[float | str, float | str]:
    node = card.select_one(f"span.fp_price.{currency}")
    if node is None:
        return "", ""
    text = node.get_text(" ", strip=True)
    total, _, per_m2 = text.partition("|")
    return number(total), number(per_m2.replace("m²", "").replace("m2", ""))


def parse_card(card: Tag, deal: str, property_type: str) -> dict[str, Any] | None:
    link = card.select_one("a.property-card__main-link[href]")
    if link is None:
        return None
    href = link["href"].split("#")[0]
    match = re.search(r"-(\d+)$", href)
    if not match:
        return None
    title_el = card.select_one("h3")
    title = title_el.get_text(" ", strip=True) if title_el else ""
    address_el = card.select_one(".tc_content p")
    specs = {item.get("title", ""): item.get_text(" ", strip=True) for item in card.select("li[title]")}
    usd, usd_m2 = first_price(card, "usd")
    gel, _ = first_price(card, "gel")
    agent = card.select_one("span._rc")
    agent_name = next(iter(agent.stripped_strings), "") if agent else ""
    image = card.select_one("img[data-original]")
    return new_row(**{
        "Property ID": match.group(1),
        "Link": href,
        "Title": title,
        "Deal Type": deal,
        "Property Type": property_type,
        "City": "თბილისი",  # makler.ge lists Tbilisi only
        "Neighbourhood": neighbourhood_from_title(title),
        "Address": address_el.get_text(" ", strip=True) if address_el else "",
        "Area m2": number(specs.get("ფართობი")),
        "Floor": integer(specs.get("სართული")),
        "Rooms": integer(specs.get("ოთახები")),
        "Price USD": usd,
        "Price GEL": gel,
        "Price per m2 USD": usd_m2,
        "Owner Type": "რეალტორი",
        "Owner Name": agent_name,
        "Agency": "Makler.ge",
        "Image": image.get("data-original", "") if image else "",
    })


def parse_list(session: requests.Session, page: int) -> list[dict[str, Any]]:
    if page > 1:
        return []
    rows: list[dict[str, Any]] = []
    for index, (path, deal, property_type) in enumerate(CATEGORIES):
        if index:
            polite_pause()
        soup = get_soup(session, f"{BASE_URL}/ka/{path}/")
        for card in soup.select("div.feat_property"):
            row = parse_card(card, deal, property_type)
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
    values = labelled_values(
        parts, ("სტატუსი", "რემონტი", "სართული სულ", "სართული", "საძინებელი", "სველი წერტილი", "ოთახები", "ფართობი"),
    )
    phones = [
        clean_phone(link["href"].replace("tel:", ""))
        for link in soup.find_all("a", href=re.compile(r"^tel:"))
    ]
    phones = [phone for phone in phones if phone and phone not in AGENCY_PHONES]
    posted = re.search(r"(\d{2}:\d{2}) / (\d{2})\.(\d{2})\.(\d{4})", text)
    update: dict[str, Any] = {
        "Phone Number": "; ".join(dict.fromkeys(phones)),
        "Status": values.get("სტატუსი", ""),
        "Condition": values.get("რემონტი", ""),
        "Total Floors": integer(values.get("სართული სულ")),
        "Floor": integer(values.get("სართული")),
        "Bedrooms": integer(values.get("საძინებელი")),
        "Bathrooms": integer(values.get("სველი წერტილი")),
        "Rooms": integer(values.get("ოთახები")),
        "Area m2": number(values.get("ფართობი")),
    }
    if posted:
        update["Posted"] = f"{posted.group(4)}-{posted.group(3)}-{posted.group(2)} {posted.group(1)}"
    if "რეალტორი" in parts:
        index = parts.index("რეალტორი")
        if index > 0:
            update["Owner Name"] = parts[index - 1]
    if "აღწერა:" in parts:
        start = parts.index("აღწერა:") + 1
        end = next((index for index in range(start, len(parts)) if parts[index].startswith("ფართობი")), start)
        update["Description"] = truncate(" ".join(parts[start:end]))
    return update
