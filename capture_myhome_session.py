"""Capture a logged-in MyHome browser session for the GitHub phone worker."""

from __future__ import annotations

import base64
import json
import os
import time
from pathlib import Path

from playwright.sync_api import sync_playwright


STATE_JSON = Path("myhome-storage-state.json")
STATE_BASE64 = Path("myhome-storage-state.b64.txt")


def login_control_is_visible(page) -> bool:
    controls = page.get_by_text("შესვლა", exact=True)
    return any(controls.nth(index).is_visible() for index in range(controls.count()))


def main() -> int:
    with sync_playwright() as playwright:
        channel = os.getenv("PLAYWRIGHT_CHANNEL", "chrome").strip()
        launch_options = {"headless": False}
        if channel:
            launch_options["channel"] = channel
        browser = playwright.chromium.launch(**launch_options)
        context = browser.new_context(locale="ka-GE", timezone_id="Asia/Tbilisi")
        page = context.new_page()
        page.goto("https://www.myhome.ge/", wait_until="domcontentloaded")
        consent = page.locator("#cookiescript_accept")
        if consent.count() and consent.first.is_visible():
            consent.first.click()
        print("Log in to MyHome/TNET in the opened browser window.")
        print("The browser will close automatically after login is detected.")

        # Avoid a hidden-terminal prompt: wait until MyHome's visible sign-in
        # control has remained absent for several consecutive observations.
        deadline = time.monotonic() + 300
        authenticated_observations = 0
        while time.monotonic() < deadline:
            if page.is_closed():
                raise RuntimeError("Browser was closed before login was captured")
            if "myhome.ge" in page.url and not login_control_is_visible(page):
                authenticated_observations += 1
                if authenticated_observations >= 4:
                    break
            else:
                authenticated_observations = 0
            page.wait_for_timeout(1_000)
        else:
            raise RuntimeError("Timed out waiting for MyHome login")

        state = context.storage_state()
        browser.close()

    raw = json.dumps(state, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    STATE_JSON.write_bytes(raw)
    STATE_BASE64.write_text(base64.b64encode(raw).decode("ascii"), encoding="ascii")
    print(f"Saved {STATE_JSON} and {STATE_BASE64}.")
    print("Copy the .b64.txt contents into GitHub secret MYHOME_STORAGE_STATE_B64.")
    print("Never commit or share either generated file.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
