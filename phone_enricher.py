"""Use MyHome's real browser flow to enrich blank Excel phone cells.

This module does not solve or bypass interactive CAPTCHA challenges.  It clicks
the same public "show number" control a user sees and records the successful
JSON response.  A saved, user-authorized MyHome session can be supplied through
``MYHOME_STORAGE_STATE_B64`` so CI does not need the account password.
"""

from __future__ import annotations

import argparse
import base64
import json
import logging
import math
import os
import re
import tempfile
import time
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

import storage
from sites.common import OWNER_PHYSICAL
from playwright.sync_api import (
    BrowserContext,
    Error as PlaywrightError,
    Page,
    TimeoutError as PlaywrightTimeoutError,
    sync_playwright,
)


LOGGER = logging.getLogger("myhome-phone-enricher")
SITE_KEY = "myhome"
PHONE_API_FRAGMENT = "/v1/statements/phone/show"
SHOW_NUMBER_TEXT = "ნომრის ნახვა"
FULL_PHONE_PATTERN = re.compile(r"(?<!\d)(?:\+?995\s*)?5\d{2}[\s-]?\d{3}[\s-]?\d{3}(?!\d)")
MYHOME_HOME_URL = "https://www.myhome.ge/"


def env_int(name: str, default: int) -> int:
    try:
        return max(0, int(os.getenv(name, str(default))))
    except ValueError:
        return default


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def load_storage_state() -> dict[str, Any] | None:
    encoded = os.getenv("MYHOME_STORAGE_STATE_B64", "").strip()
    if not encoded:
        LOGGER.warning("MYHOME_STORAGE_STATE_B64 is absent; attempting public phone flow")
        return None

    # GitHub's secret editor can preserve a BOM or line wrapping introduced by
    # text editors.  Also accept the raw JSON storage-state file so pasting
    # either generated helper file works.  None of these transformations weaken
    # validation of the decoded JSON structure below.
    encoded = encoded.lstrip("\ufeff").strip()
    if len(encoded) >= 2 and encoded[0] == encoded[-1] and encoded[0] in "\"'":
        encoded = encoded[1:-1].strip()
    try:
        if encoded.startswith("{"):
            raw_state = encoded
        else:
            compact = re.sub(r"\s+", "", encoded)
            raw_state = base64.b64decode(compact, validate=True).decode("utf-8")
        state = json.loads(raw_state)
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError(
            "MYHOME_STORAGE_STATE_B64 is neither Base64 storage-state JSON nor raw JSON"
        ) from exc
    if not isinstance(state, dict) or "cookies" not in state:
        raise RuntimeError("MYHOME_STORAGE_STATE_B64 is not a Playwright storage state")
    return state


def normalize_phone(value: Any) -> str:
    if value is None:
        return ""
    phone = str(value).strip()
    if not phone or "*" in phone:
        return ""
    return re.sub(r"\s+", "", phone)


def myhome_credentials() -> tuple[str, str] | None:
    email = os.getenv("MYHOME_EMAIL", "").strip()
    password = os.getenv("MYHOME_PASSWORD", "")
    if bool(email) != bool(password):
        raise RuntimeError("MYHOME_EMAIL and MYHOME_PASSWORD must be configured together")
    return (email, password) if email else None


def visible_exact_text(page: Page, text: str) -> bool:
    matches = page.get_by_text(text, exact=True)
    return any(matches.nth(index).is_visible() for index in range(matches.count()))


def accept_cookie_consent(page: Page) -> None:
    """Close CookieScript's consent dialog; it overlays the whole page and
    intercepts clicks on the login and show-number buttons."""
    try:
        consent = page.locator("#cookiescript_accept")
        if consent.count() and consent.first.is_visible():
            consent.first.click(timeout=5_000)
            page.wait_for_timeout(300)
    except (PlaywrightTimeoutError, PlaywrightError):
        LOGGER.debug("Cookie consent control could not be clicked")
    # The wrapper sometimes stays in the DOM (or appears late); remove it so it
    # can no longer intercept pointer events.
    try:
        page.evaluate("document.querySelectorAll('[id^=\"cookiescript_injected\"]').forEach(n => n.remove())")
    except PlaywrightError:
        pass


def wait_for_managed_check(page: Page) -> bool:
    try:
        page.wait_for_function(
            "!document.title.toLowerCase().includes('just a moment')",
            timeout=25_000,
        )
        return True
    except PlaywrightTimeoutError:
        return False


def login_form_visible(page: Page) -> bool:
    return "auth.tnet.ge" in page.url or (
        page.locator("input[name='Email']").count() > 0
        and page.locator("input[name='Password']").count() > 0
    )


def ensure_authenticated(page: Page, credentials: tuple[str, str] | None) -> bool:
    """Log in once using GitHub secrets when the saved session is not valid."""
    page.goto(MYHOME_HOME_URL, wait_until="domcontentloaded", timeout=60_000)
    if not wait_for_managed_check(page):
        LOGGER.warning("MyHome managed browser check did not complete before login")
        return False
    accept_cookie_consent(page)
    if not visible_exact_text(page, "შესვლა"):
        LOGGER.info("Saved MyHome session is authenticated")
        return True
    if credentials is None:
        LOGGER.warning("MyHome login is required but login secrets are absent")
        return False

    email, password = credentials
    sign_in = page.get_by_text("შესვლა", exact=True)
    clicked = False
    for index in range(sign_in.count()):
        if not sign_in.nth(index).is_visible():
            continue
        try:
            sign_in.nth(index).click(timeout=10_000)
        except PlaywrightTimeoutError:
            accept_cookie_consent(page)
            try:
                sign_in.nth(index).click(timeout=10_000, force=True)
            except PlaywrightTimeoutError:
                LOGGER.warning("MyHome sign-in button could not be clicked")
                return False
        clicked = True
        break
    if not clicked:
        LOGGER.warning("MyHome sign-in button was not found")
        return False
    try:
        page.wait_for_url(re.compile(r"https://auth\.tnet\.ge/"), timeout=30_000)
        page.locator("input[name='Email']").fill(email)
        page.locator("input[name='Password']").fill(password)
        page.get_by_role("button", name="შესვლა", exact=True).click(timeout=10_000)
        page.wait_for_url(re.compile(r"https://(?:www\.)?myhome\.ge/"), timeout=60_000)
        page.wait_for_load_state("domcontentloaded", timeout=30_000)
    except PlaywrightTimeoutError:
        LOGGER.warning("MyHome sign-in did not finish; CAPTCHA or verification may be required")
        return False

    authenticated = not visible_exact_text(page, "შესვლა")
    LOGGER.info("MyHome credential sign-in completed=%s", authenticated)
    return authenticated


def phones_from_payload(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    data = payload.get("data")
    if not isinstance(data, dict) or data.get("status") != "SUCCESS":
        return ""
    phones = [
        normalize_phone(data.get("phone_number")),
        normalize_phone(data.get("additional_phone_number")),
    ]
    return "; ".join(dict.fromkeys(phone for phone in phones if phone))


def visible_show_button(page: Page):
    candidates = page.locator("button", has_text=SHOW_NUMBER_TEXT)
    for index in range(candidates.count()):
        candidate = candidates.nth(index)
        if candidate.is_visible():
            return candidate
    return None


def phone_from_visible_page(page: Page) -> str:
    links = page.locator("a[href^='tel:']")
    phones: list[str] = []
    for index in range(links.count()):
        link = links.nth(index)
        if not link.is_visible():
            continue
        href = link.get_attribute("href") or ""
        match = FULL_PHONE_PATTERN.search(href.replace("tel:", ""))
        if match:
            phones.append(normalize_phone(match.group(0)))
    # MyHome sometimes replaces the button with plain text instead of a tel:
    # link. Masked values do not match FULL_PHONE_PATTERN.
    body_text = page.locator("body").inner_text()
    phones.extend(normalize_phone(match.group(0)) for match in FULL_PHONE_PATTERN.finditer(body_text))
    return "; ".join(dict.fromkeys(phone for phone in phones if phone))


def reveal_phone_once(page: Page, link: str) -> tuple[str, str]:
    """Return ``(phone, status)`` for one listing page."""
    page.goto(link, wait_until="domcontentloaded", timeout=60_000)

    # A fresh browser can briefly receive MyHome's managed browser check.  We do
    # not solve or bypass it; a normal visible Chrome session is allowed time to
    # complete it in exactly the same way as a user browser.
    if not wait_for_managed_check(page):
        return "", "browser_check"

    # CookieScript's consent dialog overlays the phone button on a new profile.
    # Accepting it also stores the choice for later listings in this context.
    accept_cookie_consent(page)

    button = visible_show_button(page)
    if button is None:
        return phone_from_visible_page(page), "button_not_found"

    try:
        with page.expect_response(
            lambda response: PHONE_API_FRAGMENT in response.url,
            timeout=20_000,
        ) as response_info:
            button.click(timeout=15_000)
        response = response_info.value
        try:
            payload = response.json()
        except PlaywrightError:
            payload = None
        phone = phones_from_payload(payload)
        if phone:
            return phone, "success"
        status = "unknown"
        if isinstance(payload, dict) and isinstance(payload.get("data"), dict):
            status = str(payload["data"].get("status") or status).lower()
        return phone_from_visible_page(page), status
    except PlaywrightTimeoutError:
        # A login dialog or an interactive CAPTCHA can prevent the API call.
        if login_form_visible(page) or visible_exact_text(page, "შესვლა"):
            status = "login_required"
        else:
            body_text = page.locator("body").inner_text().lower()
            status = "captcha" if "captcha" in body_text or "რობოტ" in body_text else "phone_api_timeout"
        return phone_from_visible_page(page), status


def reveal_phone(page: Page, link: str) -> tuple[str, str]:
    """Retry transient browser/reCAPTCHA failures with a fresh page load."""
    attempts = max(1, env_int("PHONE_REVEAL_ATTEMPTS", 2))
    last_status = "not_attempted"
    for attempt in range(1, attempts + 1):
        phone, last_status = reveal_phone_once(page, link)
        if phone:
            return phone, last_status
        if attempt < attempts:
            LOGGER.debug("Retrying phone reveal after status=%s", last_status)
            page.wait_for_timeout(1_000)
    return "", last_status


def rotating_batch(rows: list[int], limit: int) -> list[int]:
    """Prioritize fresh blanks and rotate the remaining backlog fairly."""
    if not rows or limit <= 0:
        return []

    # New owner listings matter most and may disappear quickly, so keep a small
    # newest-first priority lane on every run. Older blank rows use the rest of
    # the batch and rotate every 30 minutes so they cannot starve indefinitely.
    priority_count = min(4, limit, len(rows))
    priority = rows[:priority_count]
    backlog = rows[priority_count:]
    backlog_slots = limit - len(priority)
    if not backlog or backlog_slots <= 0:
        return priority

    batch_count = math.ceil(len(backlog) / backlog_slots)
    batch_index = int(time.time() // 1800) % batch_count
    start = batch_index * backlog_slots
    return priority + backlog[start : start + backlog_slots]


def enrich_rows(limit: int, owners_only: bool) -> tuple[int, int]:
    """Reveal phones for MyHome rows in ``data/myhome.csv`` that lack one."""
    rows = storage.load_rows(SITE_KEY)
    candidates = [
        row
        for row in rows.values()
        if row.get("Link")
        and not normalize_phone(row.get("Phone Number"))
        and (not owners_only or row.get("Owner Type") == OWNER_PHYSICAL)
    ]
    # Newest listings first; the rotating batch keeps the backlog moving.
    candidates.sort(key=lambda row: str(row.get("Timestamp Added") or ""), reverse=True)
    pending_rows = rotating_batch(candidates, limit)
    if not pending_rows:
        return 0, 0

    storage_state = load_storage_state()
    credentials = myhome_credentials()
    updated = 0
    attempted = 0
    try:
        with sync_playwright() as playwright:
            # MyHome serves a managed browser check to the Chromium headless
            # shell.  GitHub runs installed Chrome visibly inside Xvfb instead.
            # This is still unattended; Xvfb only supplies a virtual display.
            launch_args: dict[str, Any] = {
                "headless": env_bool("PLAYWRIGHT_HEADLESS", False),
                "args": ["--disable-dev-shm-usage", "--no-sandbox"],
            }
            channel = os.getenv("PLAYWRIGHT_CHANNEL", "chrome").strip()
            if channel:
                launch_args["channel"] = channel
            # Optional proxy for the browser (e.g. a residential proxy in CI, or
            # Tor Browser's SOCKS port locally): PHONE_PROXY_URL=socks5://127.0.0.1:9150
            # or http://user:pass@host:port.
            proxy_url = os.getenv("PHONE_PROXY_URL", "").strip()
            if proxy_url:
                proxy: dict[str, str] = {"server": proxy_url}
                parsed = urlparse(proxy_url)
                if parsed.username:
                    proxy["server"] = f"{parsed.scheme}://{parsed.hostname}:{parsed.port}"
                    proxy["username"] = unquote(parsed.username)
                    proxy["password"] = unquote(parsed.password or "")
                launch_args["proxy"] = proxy
                LOGGER.info("Browser proxy: %s", proxy["server"])
            browser = playwright.chromium.launch(**launch_args)
            context_args: dict[str, Any] = {
                "locale": "ka-GE",
                "timezone_id": "Asia/Tbilisi",
                "viewport": {"width": 1440, "height": 1000},
            }
            if storage_state:
                context_args["storage_state"] = storage_state
            context: BrowserContext = browser.new_context(**context_args)
            page = context.new_page()
            ensure_authenticated(page, credentials)
            for row in pending_rows:
                property_id = row["Property ID"]
                link = str(row["Link"])
                attempted += 1
                try:
                    phone, status = reveal_phone(page, link)
                    if phone:
                        row["Phone Number"] = phone
                        updated += 1
                        LOGGER.info("Revealed phone for property %s", property_id)
                    else:
                        LOGGER.warning(
                            "Phone unavailable for property %s (status=%s)",
                            property_id,
                            status,
                        )
                except PlaywrightError as exc:
                    LOGGER.warning("Browser error for property %s: %s", property_id, exc)
            context.close()
            browser.close()
    finally:
        # Phones revealed before an error are still worth keeping.
        if updated:
            storage.save_rows(SITE_KEY, rows)
    return attempted, updated


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--limit", type=int, default=env_int("PHONE_BROWSER_RETRY_LIMIT", 12)
    )
    parser.add_argument(
        "--all-owner-types", action="store_true",
        help="also reveal phones of agency/broker listings (default: owners only)",
    )
    parser.add_argument("--log-level", default=os.getenv("LOG_LEVEL", "INFO"))
    args = parser.parse_args()
    logging.basicConfig(
        level=getattr(logging, str(args.log_level).upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
    )
    owners_only = not args.all_owner_types and env_bool("PHONE_OWNERS_ONLY", True)
    try:
        attempted, updated = enrich_rows(args.limit, owners_only)
    except (OSError, RuntimeError, PlaywrightError) as exc:
        LOGGER.exception("Phone enrichment failed: %s", exc)
        return 1
    LOGGER.info("Phone enrichment attempted=%s updated=%s", attempted, updated)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
