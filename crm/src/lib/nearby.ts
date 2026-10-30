// What is near a flat — shops, schools, parks, cafés… — from OpenStreetMap
// (Overpass API).  Looked up once per flat and kept for 30 days in
// SharedPost.nearby, so the mini app never waits on Overpass twice.

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
const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

function kindOf(tags: Record<string, string>): PlaceKind | null {
  if (tags.shop === "supermarket" || tags.shop === "convenience") return "supermarket";
  if (tags.amenity === "school") return "school";
  if (tags.amenity === "kindergarten") return "kindergarten";
  if (tags.leisure === "park") return "park";
  if (tags.amenity === "cafe" || tags.amenity === "restaurant") return "cafe";
  if (tags.amenity === "pharmacy") return "pharmacy";
  if (tags.leisure === "fitness_centre") return "gym";
  return null;
}

/** Walking minutes, same rule as the metro badge (straight line × 1.3, 80 m/min). */
function walkMinutes(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const metres = 2 * r * Math.asin(Math.sqrt(a));
  return Math.max(1, Math.round((metres * 1.3) / 80));
}

async function overpass(lat: number, lng: number): Promise<Place[]> {
  const around = `(around:${RADIUS},${lat},${lng})`;
  const query = `[out:json][timeout:40];(
    nwr${around}[shop~"^(supermarket|convenience)$"];
    nwr${around}[amenity~"^(school|kindergarten|cafe|restaurant|pharmacy)$"];
    nwr${around}[leisure~"^(park|fitness_centre)$"];
  );out center tags 400;`;
  let lastError: unknown = null;
  for (const url of ENDPOINTS) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "TbilisiHomes-CRM/1.0" },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(45000),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`overpass ${response.status}`);
      const json = (await response.json()) as { elements: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] };
      const places: Place[] = [];
      for (const el of json.elements) {
        const tags = el.tags ?? {};
        const kind = kindOf(tags);
        const pLat = el.lat ?? el.center?.lat;
        const pLng = el.lon ?? el.center?.lon;
        if (!kind || pLat == null || pLng == null) continue;
        // Unnamed corner shops and cafés are noise; unnamed parks still count.
        const ka = tags["name:ka"] || tags.name || "";
        if (!ka && kind !== "park") continue;
        places.push({
          kind,
          name: { ka, en: tags["name:en"] || ka, ru: tags["name:ru"] || tags["name:en"] || ka },
          lat: pLat,
          lng: pLng,
          minutes: walkMinutes(lat, lng, pLat, pLng),
        });
      }
      // Nearest 6 of each kind are plenty for the card and the map.
      return PLACE_KINDS.flatMap((k) => places.filter((p) => p.kind === k).sort((a, b) => a.minutes - b.minutes).slice(0, 6));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
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
  const places = await overpass(point.lat, point.lng);
  const result: Nearby = { center: { lat: point.lat, lng: point.lng }, places };
  await prisma.sharedPost.update({ where: { id: post.id }, data: { nearby: JSON.stringify(result), nearbyAt: new Date() } });
  return result;
}

/**
 * Background fill, run by the 10-minute cron: looks up places for public flats
 * that have none yet (the public Overpass server can take 30+ seconds, too slow
 * to make a client wait).  A failed lookup is retried an hour later.
 */
export async function warmNearby(budgetMs = 100000): Promise<number> {
  const started = Date.now();
  const stale = new Date(Date.now() - MAX_AGE);
  const posts = await prisma.sharedPost.findMany({
    where: { AND: [publicWhere(), { lat: { not: null }, lng: { not: null }, mapMode: { not: "off" } }, { OR: [{ nearbyAt: null }, { nearbyAt: { lt: stale } }] }] },
    orderBy: { updatedAt: "desc" },
    take: 4,
    select: { id: true, refNo: true },
  });
  let done = 0;
  for (const post of posts) {
    if (Date.now() - started > budgetMs - 50000) break;
    try {
      if (post.refNo && (await nearbyFor(post.refNo))) done += 1;
    } catch {
      await prisma.sharedPost.update({ where: { id: post.id }, data: { nearbyAt: new Date(stale.getTime() + 3600_000) } });
    }
  }
  return done;
}
