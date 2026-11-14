"""Fingerprint listing photos for the CRM's image search.

For listings whose photos are not fingerprinted yet (newest first), download
up to PHOTOS_PER_LISTING photos and store a 64-bit difference hash (dHash) of
each in ``listing_image_hashes``.  The CRM hashes an uploaded photo the same
way in the browser and finds listings whose photos are (almost) identical.

The hash: greyscale (ITU-R 601: 299/587/114), area-averaged down to 9x8,
(after shrinking to at most 128 px), then one bit per neighbouring pair in each row: 1 when the left pixel is
brighter than the right one.  Row by row, most significant bit first, as 16
hex characters.  crm/src/lib/imageHash.ts must stay identical.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from io import BytesIO

import requests
from PIL import Image

import storage

LOGGER = logging.getLogger("hash_images")
LIMIT = int(os.getenv("HASH_LISTINGS_PER_RUN", "400"))
PHOTOS_PER_LISTING = int(os.getenv("HASH_PHOTOS_PER_LISTING", "8"))
WORKERS = int(os.getenv("HASH_WORKERS", "16"))
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"


def dhash(data: bytes) -> str:
    image = Image.open(BytesIO(data))
    image.draft("RGB", (256, 256))  # JPEG: decode at a reduced size (fast; the hash is size-independent)
    image = image.convert("RGB")
    # Longest side 128 px (the browser does the same before averaging).
    if max(image.size) > 128:
        image.thumbnail((128, 128), Image.BOX)
    width, height = image.size
    pixels = image.load()
    # Greyscale as floats, then the same cell averaging as the browser code.
    grey = [[0.0] * width for _ in range(height)]
    for y in range(height):
        row = grey[y]
        for x in range(width):
            r, g, b = pixels[x, y][:3]
            row[x] = (r * 299 + g * 587 + b * 114) / 1000
    cells = [[0.0] * 9 for _ in range(8)]
    counts = [[0] * 9 for _ in range(8)]
    for y in range(height):
        cy = min(7, y * 8 // height)
        row = grey[y]
        for x in range(width):
            cx = min(8, x * 9 // width)
            cells[cy][cx] += row[x]
            counts[cy][cx] += 1
    bits = 0
    for cy in range(8):
        avg = [cells[cy][cx] / max(1, counts[cy][cx]) for cx in range(9)]
        for cx in range(8):
            bits = (bits << 1) | (1 if avg[cx] > avg[cx + 1] else 0)
    return f"{bits:016x}"


def photos_of(image: str | None, images: str | None) -> list[str]:
    urls: list[str] = []
    try:
        listed = json.loads(images or "[]")
        if isinstance(listed, list):
            urls = [u for u in listed if isinstance(u, str) and u.startswith("http")]
    except ValueError:
        pass
    if image and image.startswith("http") and image not in urls:
        urls.insert(0, image)
    return list(dict.fromkeys(urls))[:PHOTOS_PER_LISTING]


def fetch_hash(session: requests.Session, url: str) -> str:
    try:
        response = session.get(url, timeout=15)
        if response.status_code != 200 or not response.content:
            return ""
        return dhash(response.content)
    except Exception:  # broken / missing photo: stored as "" so it is not tried again
        return ""


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    url = storage.database_url()
    if not url:
        LOGGER.info("no DATABASE_URL; nothing to do")
        return 0
    db = storage.Database(url)
    try:
        try:
            rows = db.execute(
                'SELECT l."id", l."image", l."images" FROM "listings" l '
                'WHERE (l."image" IS NOT NULL OR l."images" IS NOT NULL) '
                'AND NOT EXISTS (SELECT 1 FROM "listing_image_hashes" h WHERE h."listing_id" = l."id") '
                'ORDER BY l."collected_at" DESC LIMIT ?',
                (LIMIT,),
            ).fetchall()
        except Exception as exc:  # table not created yet (CRM not deployed)
            LOGGER.warning("listing_image_hashes not available: %s", exc)
            return 0
        jobs = [(listing_id, photo) for listing_id, image, images in rows for photo in photos_of(image, images)]
        listings_without_photos = [listing_id for listing_id, image, images in rows if not photos_of(image, images)]
        with requests.Session() as session, ThreadPoolExecutor(WORKERS) as pool:
            session.headers.update({"User-Agent": UA, "Accept": "image/avif,image/webp,image/*,*/*;q=0.8"})
            hashes = list(pool.map(lambda job: fetch_hash(session, job[1]), jobs))
        now = db.date_value(datetime.now())
        values = [(uuid.uuid4().hex, listing_id, photo[:1000], h, now) for (listing_id, photo), h in zip(jobs, hashes)]
        # A listing with no usable photo gets one empty row, so it is not picked again every run.
        values += [(uuid.uuid4().hex, listing_id, "", "", now) for listing_id in listings_without_photos]
        db.executemany(
            'INSERT INTO "listing_image_hashes" ("id", "listing_id", "url", "hash", "created_at") VALUES (?, ?, ?, ?, ?)',
            values,
        )
        db.commit()
        good = sum(1 for h in hashes if h)
        LOGGER.info("hashed %s listings: %s photos, %s unreadable", len(rows), good, len(hashes) - good)
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
