"""One-time local helper that obtains personal Google Drive OAuth values.

Download a Desktop OAuth client JSON file from Google Cloud, then run:

    python authorize_google_drive.py path/to/client_secret.json

The browser authorization grants access only to Drive files created by this
monitor. Copy the three printed values into GitHub Actions secrets and delete
the downloaded client JSON afterward.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow

from drive_sync import DRIVE_FILE_SCOPE


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("client_json", type=Path)
    args = parser.parse_args()

    flow = InstalledAppFlow.from_client_secrets_file(
        str(args.client_json), scopes=[DRIVE_FILE_SCOPE]
    )
    credentials = flow.run_local_server(
        host="localhost",
        port=0,
        authorization_prompt_message="Opening Google authorization: {url}",
        success_message="Authorization complete. You may close this browser tab.",
        open_browser=True,
        access_type="offline",
        prompt="consent",
    )
    if not credentials.refresh_token:
        raise RuntimeError("Google did not return a refresh token; revoke the app and retry")

    installed = json.loads(args.client_json.read_text(encoding="utf-8"))["installed"]
    print("\nCreate these three GitHub Actions repository secrets:\n")
    print(f"GOOGLE_DRIVE_CLIENT_ID={installed['client_id']}")
    print(f"GOOGLE_DRIVE_CLIENT_SECRET={installed['client_secret']}")
    print(f"GOOGLE_DRIVE_REFRESH_TOKEN={credentials.refresh_token}")
    print("\nTreat these values as passwords and never commit them to Git.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
