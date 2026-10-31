import { randomBytes } from "node:crypto";
import type { Listing } from "@prisma/client";
import { prisma } from "./db";

// Shared posts: our own copy of an ad, sent to a client as a private link.
// Import fills a draft from (1) the listing our collector already stored and
// (2) the live page where the site allows it.  MyHome sits behind a Cloudflare
// challenge, so for MyHome the stored listing is usually the only source.

export const POST_STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "მონახაზი", cls: "bg-amber-100 text-amber-800" },
  published: { label: "გამოქვეყნებული", cls: "bg-emerald-100 text-emerald-800" },
  archived: { label: "დაარქივებული", cls: "bg-gray-200 text-gray-600" },
};

export const MAX_PHOTOS = 20;
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export function newToken(): string {
  return randomBytes(18).toString("base64url");
}

/** Georgian phone numbers (mobile and Tbilisi landline), with or without +995. */
const PHONE_RE = /(?:\+?995[\s\-.]?)?(?:5\d{2}|32\d|322)[\s\-.]?\d{2,3}[\s\-.]?\d{2}[\s\-.]?\d{2}\b/g;

/** Swap the owner's numbers in a description for ours (or drop them). */
export function replacePhones(text: string, replacement = ""): string {
  return text
    .replace(PHONE_RE, replacement)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.;:])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** wa.me / tel: form of a Georgian number: 599123456 -> 995599123456. */
export function intlPhone(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("995")) return digits;
  if (digits.length === 9) return `995${digits}`;
  return digits;
}

export type PostDraft = {
  title: string;
  dealType?: string | null;
  propertyType?: string | null;
  location?: string | null;
  price?: number | null;
  currency?: string;
  area?: number | null;
  rooms?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  floor?: number | null;
  totalFloors?: number | null;
  condition?: string | null;
  description?: string | null;
  lat?: number | null;
  lng?: number | null;
  listingId?: string | null;
  imageUrls: string[];
};

const HOST_SITES: Record<string, string> = {
  "myhome.ge": "myhome",
  "binebi.ge": "binebi",
  "ss.ge": "ssge",
  "place.ge": "place",
  "rentals.ge": "rentals",
  "korter.ge": "korter",
  "avezor.ge": "avezor",
  "makler.ge": "makler",
  "housing.ge": "housing",
};

function siteForHost(host: string): string | null {
  const bare = host.replace(/^www\./, "").replace(/^home\./, "");
  for (const [domain, site] of Object.entries(HOST_SITES)) if (bare === domain || bare.endsWith(`.${domain}`)) return site;
  return null;
}

function propertyIdFromUrl(url: URL, site: string | null): string | null {
  if (site === "binebi") return url.pathname.match(/\/gancxadebebi\/(\d+)/)?.[1] ?? null;
  const runs = url.pathname.match(/\d{5,}/g);
  return runs ? runs[runs.length - 1] : null;
}

async function findListing(url: URL, site: string | null): Promise<Listing | null> {
  const clean = url.href.replace(/[?#].*$/, "");
  const byLink = await prisma.listing.findFirst({ where: { link: { in: [clean, clean.replace(/\/$/, ""), `${clean.replace(/\/$/, "")}/`] } } });
  if (byLink) return byLink;
  const propertyId = propertyIdFromUrl(url, site);
  if (!propertyId) return null;
  return prisma.listing.findFirst({ where: site ? { site, propertyId } : { propertyId } });
}

/** Bigger versions of MyHome photos.  Old-style URLs are numbered (_1, _2, ...). */
function myhomeImageCandidates(image: string): string[] {
  const numbered = image.match(/^(.*)\/thumbs\/(\d+)_\d+\.jpg$/);
  if (numbered) return Array.from({ length: MAX_PHOTOS }, (_, i) => `${numbered[1]}/large/${numbered[2]}_${i + 1}.jpg`);
  if (/_thumb\.(webp|jpe?g)$/.test(image)) return [image.replace(/_thumb(\.\w+)$/, "$1")];
  return [image];
}

function fromListing(listing: Listing): PostDraft {
  const place = [listing.neighbourhood, listing.district, listing.city].filter(Boolean);
  return {
    title: listing.title || [listing.dealType, listing.propertyType].filter(Boolean).join(" "),
    dealType: listing.dealType,
    propertyType: listing.propertyType,
    location: place.length ? Array.from(new Set(place)).join(", ") : listing.address,
    price: listing.priceUsd ?? listing.priceGel,
    currency: listing.priceUsd != null ? "USD" : "GEL",
    area: listing.areaM2,
    rooms: listing.rooms,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    floor: listing.floor,
    totalFloors: listing.totalFloors,
    condition: listing.condition || listing.status,
    description: listing.description,
    listingId: listing.id,
    lat: listing.lat,
    lng: listing.lng,
    imageUrls: storedImages(listing),
  };
}

/** Every photo the collector saved, else guesses from the first photo. */
function storedImages(listing: Listing): string[] {
  try {
    const saved = JSON.parse(listing.images ?? "[]");
    if (Array.isArray(saved) && saved.length) return saved.filter((u): u is string => typeof u === "string");
  } catch {
    // fall through
  }
  if (!listing.image) return [];
  return listing.site === "myhome" ? myhomeImageCandidates(listing.image) : [listing.image];
}

export async function draftFromListing(listingId: string): Promise<PostDraft | null> {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  return listing ? fromListing(listing) : null;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "ka,en;q=0.8" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("text/html")) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function textOf(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
}

function meta(html: string, name: string): string {
  const re = new RegExp(`<meta[^>]+(?:property|name)="${name}"[^>]+content="([^"]*)"`, "i");
  return decodeEntities(html.match(re)?.[1] ?? "").trim();
}

function num(text: string | undefined | null): number | null {
  const match = String(text ?? "").replace(/\s/g, "").replace(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function int(text: string | undefined | null): number | null {
  const value = num(text);
  return value == null ? null : Math.round(value);
}

function parseBinebi(html: string, url: URL): Partial<PostDraft> {
  const facts: Record<string, string> = {};
  for (const m of html.matchAll(/ui-fact__label">([^<]+)<\/span>\s*<span class="ui-fact__value">([^<]+)</g)) facts[m[1].trim()] = m[2].trim();
  for (const m of html.matchAll(/<dt>([^<]+)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)) facts[m[1].trim()] ??= textOf(m[2]);
  const id = url.pathname.match(/\/gancxadebebi\/(\d+)/)?.[1] ?? "";
  const images = Array.from(new Set([...html.matchAll(/https:\/\/cdn\.binebi\.ge\/uploads\/homes\/(\d+)\/[^"'\s)]+\.(?:jpe?g|png|webp)/gi)].filter((m) => (!id || m[1] === id) && !m[0].includes("/thumbnail/")).map((m) => m[0])));
  const crumbs = [...html.matchAll(/"@type":"ListItem","position":(\d+),"name":"([^"]+)"/g)].sort((a, b) => Number(a[1]) - Number(b[1])).map((m) => m[2]);
  const priceCard = html.slice(html.indexOf("ui-price-card"));
  const priceMatch = priceCard.match(/class="valute">([^<]+)<\/span>\s*<div class="price" data-price="([\d.]+)"/);
  const [floor, totalFloors] = (facts["სართული"] ?? "").split("/").map((part) => int(part));
  const body = html.match(/ui-readmore__body">([\s\S]*?)<\/div>/)?.[1];
  const ogTitle = meta(html, "og:title").replace(/\s*\|\s*Binebi\.ge\s*$/i, "");
  const titleParts = ogTitle.split(",").map((part) => part.trim());
  return {
    // og:title is "<title>, <city>, <district>, <street>": keep district and
    // city only, the exact street stays with the agent.
    title: titleParts[0] || ogTitle,
    location: [titleParts[2], titleParts[1]].filter(Boolean).join(", ") || null,
    dealType: crumbs[1] ?? null,
    price: priceMatch ? Number(priceMatch[2]) : null,
    currency: priceMatch && priceMatch[1].includes("$") ? "USD" : "GEL",
    area: num(facts["ფართი"]),
    rooms: int(facts["ოთახები"]),
    bedrooms: int(facts["საძინებელი"]),
    bathrooms: int(facts["სველი წერტილი"]),
    floor: floor ?? null,
    totalFloors: totalFloors ?? null,
    condition: facts["მდგომარეობა"] || null,
    description: body ? textOf(body) : null,
    // The detail page's map script: var map_lon = '44.88'; var map_lat = '41.71';
    lat: validCoord(Number(html.match(/map_lat\s*=\s*'(-?[\d.]+)'/)?.[1]), 90),
    lng: validCoord(Number(html.match(/map_lon\s*=\s*'(-?[\d.]+)'/)?.[1]), 180),
    imageUrls: images,
  };
}

type MyhomeStatement = Record<string, unknown> & { images?: unknown[]; price?: Record<string, { price_total?: number }> };

function parseMyhome(html: string): Partial<PostDraft> | null {
  const raw = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!raw) return null;
  try {
    const queries = JSON.parse(raw)?.props?.pageProps?.dehydratedState?.queries ?? [];
    const query = queries.find((q: { queryHash?: string }) => String(q.queryHash).includes("details"));
    const s: MyhomeStatement | undefined = query?.state?.data?.data?.statement;
    if (!s) return null;
    const images = (s.images ?? [])
      .map((image) => (typeof image === "string" ? image : ((image as Record<string, string>).large || (image as Record<string, string>).original || (image as Record<string, string>).thumb)))
      .filter(Boolean) as string[];
    const usd = s.price?.["2"]?.price_total;
    const gel = s.price?.["1"]?.price_total;
    const place = [s.urban_name, s.district_name, s.city_name].filter(Boolean) as string[];
    return {
      title: String(s.dynamic_title ?? "").trim() || undefined,
      location: place.length ? place.join(", ") : null,
      price: usd ?? gel ?? null,
      currency: usd != null ? "USD" : "GEL",
      area: num(String(s.area ?? "")),
      rooms: int(String(s.room ?? "")),
      bedrooms: int(String(s.bedroom ?? "")),
      floor: int(String(s.floor ?? "")),
      totalFloors: int(String(s.total_floors ?? "")),
      description: s.comment ? String(s.comment) : null,
      lat: validCoord(Number(s.lat), 90),
      lng: validCoord(Number(s.lng), 180),
      imageUrls: images,
    };
  } catch {
    return null;
  }
}

function parseGeneric(html: string): Partial<PostDraft> {
  const image = meta(html, "og:image");
  const description = meta(html, "og:description") || meta(html, "description");
  return {
    title: meta(html, "og:title") || textOf(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? ""),
    description: description || null,
    imageUrls: image ? [image] : [],
  };
}

/** Merge: live page values win over stored ones, empty values never overwrite. */
function merge(base: PostDraft | null, live: Partial<PostDraft> | null): PostDraft {
  const result: PostDraft = base ? { ...base } : { title: "", imageUrls: [] };
  if (!live) return result;
  for (const [key, value] of Object.entries(live) as [keyof PostDraft, unknown][]) {
    if (value == null || value === "") continue;
    if (key === "imageUrls") {
      if ((value as string[]).length) result.imageUrls = value as string[];
      continue;
    }
    (result as Record<string, unknown>)[key] = value;
  }
  return result;
}

function validCoord(value: number, limit: number): number | null {
  return Number.isFinite(value) && value !== 0 && Math.abs(value) <= limit ? value : null;
}

function coordsIn(text: string): { lat: number; lng: number } | null {
  const decoded = decodeURIComponent(text);
  const patterns = [
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, // Google place pin (most precise)
    /@(-?\d+\.\d+),(-?\d+\.\d+)/, // Google map centre
    /[?&](?:q|query|ll|destination|center|daddr)=(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/,
    /[?&]mlat=(-?\d+\.\d+)&mlon=(-?\d+\.\d+)/, // OpenStreetMap
    /^\s*(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)\s*$/, // "41.7167, 44.7453"
  ];
  for (const re of patterns) {
    const m = decoded.match(re);
    if (!m) continue;
    const lat = validCoord(Number(m[1]), 90);
    const lng = validCoord(Number(m[2]), 180);
    if (lat != null && lng != null) return { lat, lng };
  }
  return null;
}

/** Coordinates from what an agent pastes: a Google Maps / OSM link (short
 * maps.app.goo.gl links are followed) or plain "lat, lng". */
export async function parseMapInput(raw: string): Promise<{ lat: number; lng: number } | null> {
  const input = raw.trim();
  if (!input) return null;
  const direct = coordsIn(input);
  if (direct) return direct;
  let url = input;
  for (let hop = 0; hop < 4 && /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl)\//.test(url); hop += 1) {
    try {
      const response = await fetch(url, { redirect: "manual", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000), cache: "no-store" });
      const next = response.headers.get("location");
      if (!next) break;
      url = new URL(next, url).href;
      const found = coordsIn(url);
      if (found) return found;
    } catch {
      break;
    }
  }
  return coordsIn(url);
}

export function parseSourceUrl(raw: string): URL | null {
  try {
    return new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
}

/** Sites whose pages only the collector can read; the CRM asks it to fetch them. */
export function collectorFetches(url: URL): boolean {
  return siteForHost(url.hostname) === "myhome";
}

/** The stored listing for a source link, if the collector has it. */
export async function listingForUrl(raw: string): Promise<Listing | null> {
  const url = parseSourceUrl(raw);
  return url ? findListing(url, siteForHost(url.hostname)) : null;
}

export async function draftFromUrl(raw: string): Promise<{ draft: PostDraft; found: boolean; sourceUrl: string; needsCollector: boolean }> {
  const url = parseSourceUrl(raw);
  if (!url) return { draft: { title: "", imageUrls: [] }, found: false, sourceUrl: raw.trim(), needsCollector: false };
  const site = siteForHost(url.hostname);
  const listing = await findListing(url, site);
  const html = await fetchHtml(url.href);
  let live: Partial<PostDraft> | null = null;
  if (html) live = site === "binebi" ? parseBinebi(html, url) : site === "myhome" ? parseMyhome(html) : parseGeneric(html);
  const draft = merge(listing ? fromListing(listing) : null, live);
  // MyHome without its page: missing, or stored before photos/map were kept.
  const needsCollector = collectorFetches(url) && !live?.title && (!listing || !listing.images);
  return { draft, found: Boolean(listing || live?.title), sourceUrl: url.href, needsCollector };
}

/** Ask the collector (GitHub workflow fetch-listing.yml) to fetch one listing.
 * Needs GITHUB_DISPATCH_TOKEN (fine-grained token, Actions: read and write). */
export async function requestCollectorFetch(sourceUrl: string): Promise<boolean> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return false;
  const repo = process.env.GITHUB_REPOSITORY || "Rafaell444/agentscraper";
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/fetch-listing.yml/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "crm" },
      body: JSON.stringify({ ref: "main", inputs: { url: sourceUrl } }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    return response.status === 204;
  } catch {
    return false;
  }
}

export async function downloadImage(url: string): Promise<{ mime: string; data: Uint8Array } | null> {
  try {
    const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/*" }, signal: AbortSignal.timeout(10000), cache: "no-store" });
    const mime = (response.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!response.ok || !/^image\/(jpeg|png|webp|gif)$/.test(mime)) return null;
    const data = new Uint8Array(await response.arrayBuffer());
    if (!data.length || data.length > MAX_PHOTO_BYTES) return null;
    return { mime, data };
  } catch {
    return null;
  }
}

/** Download photos in order, a few at a time.  MyHome numbered photos
 * (_1, _2, ...) are guessed, so they stop at the first missing one; a full-size
 * TNET photo that is missing falls back to its thumbnail. */
export async function downloadImages(urls: string[]): Promise<{ mime: string; data: Uint8Array }[]> {
  const unique = Array.from(new Set(urls)).slice(0, MAX_PHOTOS);
  const numbered = unique.length > 1 && unique.every((u) => /\/large\/\d+_\d+\.jpg$/.test(u));
  const photos: { mime: string; data: Uint8Array }[] = [];
  for (let i = 0; i < unique.length; i += 5) {
    const batch = await Promise.all(
      unique.slice(i, i + 5).map(async (url) => (await downloadImage(url)) ?? (/static-api-statements\.tnet\.ge/.test(url) ? downloadImage(url.replace(/(\.\w+)$/, "_thumb$1")) : null)),
    );
    for (const item of batch) {
      if (!item) {
        if (numbered) return photos;
        continue;
      }
      photos.push(item);
    }
  }
  return photos;
}

/** Contact number this agent used last time, else the agency number. */
export async function defaultContact(userId: string, agencyPhone: string): Promise<{ name: string | null; phone: string | null }> {
  const last = await prisma.sharedPost.findFirst({ where: { createdById: userId, contactPhone: { not: null } }, orderBy: { createdAt: "desc" }, select: { contactName: true, contactPhone: true } });
  return { name: last?.contactName ?? null, phone: last?.contactPhone ?? (agencyPhone || null) };
}

const FILL_TIMEOUT_MS = 5 * 60 * 1000;

/** For a post waiting on the collector: once the listing is in the database,
 * fill the fields the agent left empty, the map, and the photos (when the
 * post has at most the one thumbnail).  Returns the post's import state. */
export async function fillFromCollector(postId: string): Promise<string | null> {
  const post = await prisma.sharedPost.findUnique({ where: { id: postId }, include: { _count: { select: { photos: true } } } });
  if (!post || post.importState !== "waiting" || !post.sourceUrl) return post?.importState ?? null;
  const listing = await listingForUrl(post.sourceUrl);
  const ready = listing && listing.images && (!post.importRequestedAt || !listing.lastSyncAt || listing.lastSyncAt >= new Date(post.importRequestedAt.getTime() - 60_000));
  if (!listing || !ready) {
    if (post.importRequestedAt && Date.now() - post.importRequestedAt.getTime() > FILL_TIMEOUT_MS) {
      await prisma.sharedPost.update({ where: { id: postId }, data: { importState: "failed" } });
      return "failed";
    }
    return "waiting";
  }
  const { imageUrls, ...draft } = fromListing(listing);
  const data: Record<string, unknown> = { importState: null, listingId: listing.id };
  const keys = ["dealType", "propertyType", "location", "price", "area", "rooms", "bedrooms", "bathrooms", "floor", "totalFloors", "condition", "lat", "lng"] as const;
  for (const key of keys) if (post[key] == null || post[key] === "") data[key] = draft[key] ?? null;
  if (post.price == null && draft.price != null) data.currency = draft.currency ?? "USD";
  if (!post.title || post.title === "ახალი განცხადება") data.title = draft.title || post.title;
  if (!post.description && draft.description) data.description = replacePhones(draft.description, post.contactPhone ?? "");
  if (post._count.photos <= 1) {
    const photos = await downloadImages(imageUrls);
    if (photos.length > post._count.photos) {
      await prisma.$transaction([
        prisma.sharedPostPhoto.deleteMany({ where: { postId } }),
        prisma.sharedPostPhoto.createMany({ data: photos.map((photo, position) => ({ postId, position, mime: photo.mime, data: Buffer.from(photo.data) })) }),
      ]);
    }
  }
  await prisma.sharedPost.update({ where: { id: postId }, data });
  return null;
}
