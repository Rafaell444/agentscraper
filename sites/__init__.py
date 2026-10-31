"""Site adapters for the real-estate listing collector.

Every adapter module exposes the same small interface:

``KEY``            short identifier used for the CSV file name (``data/<KEY>.csv``)
``SHEET``          Excel tab name
``parse_list``     ``(session, page) -> list[dict]`` partial rows for one result
                   page (newest first); an empty list ends pagination
``needs_detail``   ``(row) -> bool`` whether the detail page still has to be read
``fetch_detail``   ``(session, row) -> dict`` extra fields read from the detail page

``SITE_KEYS`` are the sites collected by default: the ones that can tell owner
listings from agency listings.  housing.ge never says who posted and
makler.ge is an agency, so they are only collected when asked for explicitly
(``--sites housing,makler``) and are excluded by the owners-only scope.
"""

from __future__ import annotations

from importlib import import_module
from types import ModuleType

SITE_KEYS = ("myhome", "ssge", "binebi", "place", "rentals", "korter", "avezor")
OPTIONAL_SITE_KEYS = ("housing", "makler")


def load_site(key: str) -> ModuleType:
    if key not in SITE_KEYS + OPTIONAL_SITE_KEYS:
        raise KeyError(f"Unknown site {key!r}; choose from {', '.join(SITE_KEYS + OPTIONAL_SITE_KEYS)}")
    return import_module(f"sites.{key}")


def all_sites() -> list[ModuleType]:
    return [load_site(key) for key in SITE_KEYS]
