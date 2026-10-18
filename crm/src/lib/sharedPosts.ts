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
  listingId?: string | null;
  imageUrls: string[];
};

const HOST_SITES: Record<string, string> = {
  "myhome.ge": "myhome",
  "binebi.ge": "binebi",
  "ss.ge": "ssge",
  "place.ge": "place",
  "rentals.ge": "rentals",
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
    imageUrls: listing.image ? (listing.site === "myhome" ? myhomeImageCandidates(listing.image) : [listing.image]) : [],
  };
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

export async function draftFromUrl(raw: string): Promise<{ draft: PostDraft; found: boolean; sourceUrl: string }> {
  let url: URL;
  try {
    url = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return { draft: { title: "", imageUrls: [] }, found: false, sourceUrl: raw.trim() };
  }
  const site = siteForHost(url.hostname);
  const listing = await findListing(url, site);
  const html = await fetchHtml(url.href);
  let live: Partial<PostDraft> | null = null;
  if (html) live = site === "binebi" ? parseBinebi(html, url) : site === "myhome" ? parseMyhome(html) : parseGeneric(html);
  const draft = merge(listing ? fromListing(listing) : null, live);
  return { draft, found: Boolean(listing || live?.title), sourceUrl: url.href };
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
