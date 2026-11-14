import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isPartner } from "@/lib/auth";
import { hashDistance } from "@/lib/imageHash";
import { ownerPhones } from "@/lib/ownerPhone";

export const maxDuration = 60;

// Image search: the browser sends the dHash of each uploaded photo; we find
// scraped listings with a (nearly) identical photo, plus every other posting
// of the same flat (property key) — the owner's one with the number.

const MAX_DISTANCE = 10; // of 64 bits: same photo, re-compressed / resized / lightly watermarked
const EXACT = 4;

type Row = { listingId: string; url: string; hash: string };
let cache: { at: number; rows: Row[] } | null = null;

async function allHashes(): Promise<Row[]> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.rows;
  const rows = await prisma.listingImageHash.findMany({ where: { NOT: { hash: "" } }, select: { listingId: true, url: true, hash: true } });
  cache = { at: Date.now(), rows };
  return rows;
}

const listingSelect = {
  id: true, title: true, site: true, siteName: true, link: true, posterKind: true, ownerName: true, phone: true, propertyKey: true,
  priceUsd: true, areaM2: true, rooms: true, floor: true, totalFloors: true, neighbourhood: true, district: true, image: true, archived: true, collectedAt: true,
  lead: { select: { manualPhone: true } },
} as const;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || isPartner(session)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { hashes?: unknown };
  const hashes = (Array.isArray(body.hashes) ? body.hashes : []).filter((h): h is string => typeof h === "string" && /^[0-9a-f]{16}$/.test(h)).slice(0, 30);
  if (!hashes.length) return NextResponse.json({ error: "no photos" }, { status: 400 });

  const rows = await allHashes();
  // Best distance per listing, and which uploaded photo matched it.
  const best = new Map<string, { distance: number; photo: number; url: string }>();
  hashes.forEach((h, photo) => {
    for (const row of rows) {
      const distance = hashDistance(h, row.hash);
      if (distance > MAX_DISTANCE) continue;
      const prev = best.get(row.listingId);
      if (!prev || distance < prev.distance) best.set(row.listingId, { distance, photo, url: row.url });
    }
  });
  const matchedIds = [...best.entries()].sort((a, b) => a[1].distance - b[1].distance).slice(0, 40).map(([id]) => id);
  const matched = matchedIds.length ? await prisma.listing.findMany({ where: { id: { in: matchedIds } }, select: listingSelect }) : [];
  // Other postings of the same flats (owner + agents), from the property key.
  const keys = [...new Set(matched.map((l) => l.propertyKey).filter((k): k is string => Boolean(k)))];
  const copies = keys.length ? await prisma.listing.findMany({ where: { propertyKey: { in: keys }, id: { notIn: matchedIds } }, select: listingSelect, take: 200 }) : [];
  const phones = await ownerPhones([...matched, ...copies]);

  const shape = (l: (typeof matched)[number]) => ({
    id: l.id, title: l.title, siteName: l.siteName, link: l.link, owner: l.posterKind === "owner", ownerName: l.ownerName,
    phone: phones[l.id]?.phone ?? null, phoneFrom: phones[l.id]?.from ?? null,
    priceUsd: l.priceUsd, areaM2: l.areaM2, rooms: l.rooms, floor: l.floor, totalFloors: l.totalFloors,
    place: l.neighbourhood || l.district, image: l.image, archived: l.archived, collectedAt: l.collectedAt,
  });
  const results = matchedIds
    .map((id) => matched.find((l) => l.id === id))
    .filter((l): l is (typeof matched)[number] => Boolean(l))
    .map((l) => {
      const hit = best.get(l.id)!;
      return {
        ...shape(l),
        distance: hit.distance,
        exact: hit.distance <= EXACT,
        photo: hit.photo,
        matchedUrl: hit.url,
        copies: l.propertyKey ? copies.filter((c) => c.propertyKey === l.propertyKey).map(shape) : [],
      };
    });
  return NextResponse.json({ ok: true, indexed: rows.length, results });
}
