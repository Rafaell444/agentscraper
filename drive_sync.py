"""Create or replace properties.xlsx in a personal Google Drive account."""

from __future__ import annotations

import argparse
import base64
import os
import sys
from pathlib import Path

import requests
from google.auth.exceptions import GoogleAuthError
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload


DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file"
XLSX_MIME_TYPE = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)


def required_credentials() -> tuple[str, str, str] | None:
    values = (
        os.getenv("GOOGLE_DRIVE_CLIENT_ID", "").strip(),
        os.getenv("GOOGLE_DRIVE_CLIENT_SECRET", "").strip(),
        os.getenv("GOOGLE_DRIVE_REFRESH_TOKEN", "").strip(),
    )
    return values if all(values) else None


def webhook_credentials() -> tuple[str, str] | None:
    values = (
        os.getenv("GOOGLE_DRIVE_WEBHOOK_URL", "").strip(),
        os.getenv("GOOGLE_DRIVE_UPLOAD_TOKEN", "").strip(),
    )
    return values if all(values) else None


def sync_workbook_via_webhook(path: Path) -> str:
    """Upload through an Apps Script web app running as the Drive owner."""
    values = webhook_credentials()
    if values is None:
        raise RuntimeError(
            "GOOGLE_DRIVE_WEBHOOK_URL and GOOGLE_DRIVE_UPLOAD_TOKEN must be configured"
        )
    if not path.is_file():
        raise FileNotFoundError(path)

    webhook_url, upload_token = values
    response = requests.post(
        webhook_url,
        json={
            "token": upload_token,
            "filename": path.name,
            "content_base64": base64.b64encode(path.read_bytes()).decode("ascii"),
        },
        timeout=90,
    )
    response.raise_for_status()
    try:
        result = response.json()
    except requests.JSONDecodeError as exc:
        raise RuntimeError("Google Drive webhook returned a non-JSON response") from exc
    if not isinstance(result, dict) or not result.get("ok"):
        message = (
            result.get("error", "unknown webhook error")
            if isinstance(result, dict)
            else "invalid response"
        )
        raise RuntimeError(f"Google Drive webhook rejected the upload: {message}")

    file_id = str(result.get("file_id") or "")
    if not file_id:
        raise RuntimeError("Google Drive webhook response has no file ID")
    print(f"Google Drive file updated: https://drive.google.com/open?id={file_id}")
    return file_id


def drive_query_string(value: str) -> str:
    """Escape a literal embedded in a Google Drive query."""
    return value.replace("\\", "\\\\").replace("'", "\\'")


def sync_workbook(path: Path) -> str:
    auth_values = required_credentials()
    if auth_values is None:
        raise RuntimeError(
            "GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET and "
            "GOOGLE_DRIVE_REFRESH_TOKEN must all be configured"
        )
    if not path.is_file():
        raise FileNotFoundError(path)

    client_id, client_secret, refresh_token = auth_values
    credentials = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=[DRIVE_FILE_SCOPE],
    )
    service = build("drive", "v3", credentials=credentials, cache_discovery=False)

    escaped_name = drive_query_string(path.name)
    response = (
        service.files()
        .list(
            q=f"name = '{escaped_name}' and trashed = false",
            spaces="drive",
            fields="files(id,name,modifiedTime,webViewLink)",
            orderBy="modifiedTime desc",
            pageSize=10,
        )
        .execute(num_retries=3)
    )
    matches = response.get("files", [])
    media = MediaFileUpload(
        str(path), mimetype=XLSX_MIME_TYPE, resumable=True
    )

    if matches:
        # The OAuth scope can see files created by this application. Updating by
        # ID means the same Drive file is retained even if the user moves it.
        file_id = matches[0]["id"]
        result = (
            service.files()
            .update(fileId=file_id, media_body=media, fields="id,webViewLink")
            .execute(num_retries=3)
        )
        operation = "updated"
    else:
        result = (
            service.files()
            .create(
                body={"name": path.name},
                media_body=media,
                fields="id,webViewLink",
            )
            .execute(num_retries=3)
        )
        file_id = result["id"]
        operation = "created"

    link = result.get("webViewLink") or f"https://drive.google.com/open?id={file_id}"
    print(f"Google Drive file {operation}: {link}")
    return file_id


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", nargs="?", default="properties.xlsx")
    parser.add_argument(
        "--skip-if-unconfigured",
        action="store_true",
        help="exit successfully when the three OAuth environment values are absent",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if webhook_credentials() is None and required_credentials() is None and args.skip_if_unconfigured:
        print("Google Drive sync skipped: OAuth secrets are not configured yet")
        return 0
    try:
        path = Path(args.path).resolve()
        if webhook_credentials() is not None:
            sync_workbook_via_webhook(path)
        else:
            sync_workbook(path)
        return 0
    except (
        RuntimeError,
        FileNotFoundError,
        OSError,
        ValueError,
        requests.RequestException,
        GoogleAuthError,
        HttpError,
    ) as exc:
        print(f"Google Drive sync failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
