// What is near a flat — shops, schools, parks, cafés… — from OpenStreetMap
// (Nominatim search).  Looked up once per flat and kept for 30 days in
// SharedPost.nearby; the 10-minute cron fills it in ahead of visitors.

import { after } from "next/server";
import { prisma } from "./db";
import { publicPoint, publicWhere } from "./catalog";

export const PLACE_KINDS = ["supermarket", "school", "kindergarten", "park", "cafe", "pharmacy", "gym"] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export const PLACE_EMOJI: Record<PlaceKind, string> = {
  supermarket: "🛒",
  school: "🏫",
  kindergarten: "🧸",
  park: "🌳",
  cafe: "☕",
  pharmacy: "💊",
  gym: "🏋️",
};

export type Place = { kind: PlaceKind; name: { ka: string; en: string; ru: string }; lat: number; lng: number; minutes: number };
export type Nearby = { center: { lat: number; lng: number }; places: Place[] };

const RADIUS = 800; // metres, ~10 min on foot
const MAX_AGE = 30 * 86400_000;
// Nominatim (OpenStreetMap search) answers in under a second; the Overpass
// servers used before were often overloaded and timed out from Vercel.
// Its usage policy allows one request per second, so the searches run one
// after another and each flat is looked up only once a month.
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "TbilisiHomes-CRM/1.0 (real-estate catalog; https://agenturicrm.vercel.app)";
const SEARCHES: { kind: PlaceKind; query: string; types?: string[] }[] = [
  { kind: "supermarket", query: "amenity=supermarket" },
  { kind: "supermarket", query: "amenity=convenience%20store" },
  { kind: "school", query: "amenity=school" },
  { kind: "kindergarten", query: "amenity=kindergarten" },
  { kind: "park", query: "amenity=park" },
  { kind: "cafe", query: "amenity=cafe" },
  { kind: "cafe", query: "amenity=restaurant" },
  { kind: "pharmacy", query: "amenity=pharmacy" },
  { kind: "gym", query: "amenity=sports%20centre", types: ["sports_centre", "fitness_centre"] },
  { kind: "gym", query: "q=fitness", types: ["fitness_centre", "sports_centre"] },
];

type NominatimHit = { osm_type: string; osm_id: number; lat: string; lon: string; name?: string; type?: string; namedetails?: Record<string, string> };

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Walking minutes, same rule as the metro badge (straight line × 1.3, 80 m/min). */
function walkMinutes(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const metres = 2 * r * Math.asin(Math.sqrt(a));
  return Math.max(1, Math.round((metres * 1.3) / 80));
}

async function lookup(lat: number, lng: number): Promise<Place[]> {
  // A box of about ±800 m around the point; walking time is checked per place below.
  const dLat = RADIUS / 111_320;
  const dLng = RADIUS / (111_320 * Math.cos((lat * Math.PI) / 180));
  const viewbox = [lng - dLng, lat + dLat, lng + dLng, lat - dLat].map((n) => n.toFixed(5)).join(",");
  const seen = new Set<string>();
  const places: Place[] = [];
  let answered = 0;
  for (const [i, search] of SEARCHES.entries()) {
    if (i > 0) await pause(1100);
    try {
      const response = await fetch(`${NOMINATIM}?${search.query}&viewbox=${viewbox}&bounded=1&format=jsonv2&limit=10&namedetails=1`, {
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "ka,en,ru" },
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      });
      if (!response.ok) continue;
      const hits = (await response.json()) as NominatimHit[];
      answered += 1;
      for (const hit of hits) {
        const key = `${hit.osm_type}${hit.osm_id}`;
        if (seen.has(key) || (search.types && !search.types.includes(hit.type ?? ""))) continue;
        seen.add(key);
        const pLat = Number(hit.lat);
        const pLng = Number(hit.lon);
        const names = hit.namedetails ?? {};
        // Unnamed corner shops and cafés are noise; unnamed parks still count.
        const ka = names["name:ka"] || names.name || hit.name || "";
        if (!ka && search.kind !== "park") continue;
        const minutes = walkMinutes(lat, lng, pLat, pLng);
        if (minutes > 15) continue;
        places.push({ kind: search.kind, name: { ka, en: names["name:en"] || ka, ru: names["name:ru"] || names["name:en"] || ka }, lat: pLat, lng: pLng, minutes });
      }
    } catch {
      // one failed search leaves that kind out
    }
  }
  if (!answered) throw new Error("nominatim did not answer");
  // Nearest 6 of each kind are plenty for the card and the map.
  return PLACE_KINDS.flatMap((k) => places.filter((p) => p.kind === k).sort((a, b) => a.minutes - b.minutes).slice(0, 6));
}

/** Places around the flat's public point (the approximate one when the address is private). */
export async function nearbyFor(ref: number): Promise<Nearby | null> {
  const post = await prisma.sharedPost.findFirst({ where: { refNo: ref, catalog: true }, select: { id: true, lat: true, lng: true, mapMode: true, nearby: true, nearbyAt: true } });
  if (!post) return null;
  const point = publicPoint(post.lat, post.lng, post.mapMode);
  if (!point) return null;
  if (post.nearby && post.nearbyAt && Date.now() - post.nearbyAt.getTime() < MAX_AGE) {
    try {
      const cached = JSON.parse(post.nearby) as Nearby;
      // A moved pin makes the cache stale.
      if (Math.abs(cached.center.lat - point.lat) < 1e-6 && Math.abs(cached.center.lng - point.lng) < 1e-6) return cached;
    } catch {
      // re-fetch below
    }
  }
  const places = await lookup(point.lat, point.lng);
  const result: Nearby = { center: { lat: point.lat, lng: point.lng }, places };
  await prisma.sharedPost.update({ where: { id: post.id }, data: { nearby: JSON.stringify(result), nearbyAt: new Date() } });
  return result;
}

/**
 * Background fill, run by the 10-minute cron: looks up places for public flats
 * that have none yet (about 11 seconds per flat, one search per second).
 * A failed lookup is retried an hour later.
 */
export async function warmNearby(budgetMs = 100000): Promise<number> {
  const started = Date.now();
  const stale = new Date(Date.now() - MAX_AGE);
  const posts = await prisma.sharedPost.findMany({
    where: { AND: [publicWhere(), { lat: { not: null }, lng: { not: null }, mapMode: { not: "off" } }, { OR: [{ nearbyAt: null }, { nearbyAt: { lt: stale } }] }] },
    orderBy: { updatedAt: "desc" },
    take: 8,
    select: { id: true, refNo: true },
  });
  let done = 0;
  for (const post of posts) {
    if (Date.now() - started > budgetMs - 20000) break;
    try {
      if (post.refNo && (await nearbyFor(post.refNo))) done += 1;
    } catch {
      await prisma.sharedPost.update({ where: { id: post.id }, data: { nearbyAt: new Date(stale.getTime() + 3600_000) } });
    }
  }
  return done;
}

/** Look up places right after the response (flat added to the app, pin moved), so the first client already sees them. */
export function queueNearby(postId: string) {
  after(async () => {
    const post = await prisma.sharedPost.findUnique({ where: { id: postId }, select: { refNo: true } });
    if (post?.refNo) await nearbyFor(post.refNo).catch(() => undefined);
  });
}
