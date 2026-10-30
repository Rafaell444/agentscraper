import { prisma } from "./db";
import { getSettings } from "./settings";
import { shareBase } from "./shareUrl";
import { DEAL_LABEL, FEATURES, asLang, dealKind, featureList, headline, metroLine, photoUrl, placeName, priceText, priceUsd, termText, typeLabel, type Lang } from "./catalog";
import { metroName, metroNearby } from "./metro";
import { catalogLink } from "./channel";
import { callVerbose } from "./telegram";

// "Find me a flat" alerts: when a flat is added to the mini app, every client
// whose saved request matches it gets a bot message with a button that opens
// the flat.  Each client gets each flat once; /stop turns alerts off.

export type SearchPrefs = {
  deal?: string;
  types?: string[];
  budgetMin?: number;
  budgetMax?: number;
  roomsMin?: number;
  bedroomsMin?: number;
  bathroomsMin?: number;
  areaMin?: number;
  areaMax?: number;
  areas?: string[];
  nearMetro?: boolean;
  metro?: string[];
  notFirstFloor?: boolean;
  notLastFloor?: boolean;
  features?: string[];
  pets?: boolean;
  leaseTerm?: string;
};

const positive = (value: unknown, max = 1e9) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.min(value, max) : undefined);
const strings = (value: unknown, max = 30) => (Array.isArray(value) ? value.map((v) => String(v).replace(/[<>]/g, "").trim().slice(0, 60)).filter(Boolean).slice(0, max) : undefined);

/** Keep only well-formed criteria from the mini app request. */
export function cleanPrefs(raw: unknown): SearchPrefs {
  const p = (raw ?? {}) as Record<string, unknown>;
  const list = (v: unknown) => { const l = strings(v); return l?.length ? l : undefined; };
  return {
    deal: ["rent", "sale", "daily"].includes(String(p.deal)) ? String(p.deal) : undefined,
    types: list(p.types),
    budgetMin: positive(p.budgetMin),
    budgetMax: positive(p.budgetMax),
    roomsMin: positive(p.roomsMin, 20) && Math.round(positive(p.roomsMin, 20)!),
    bedroomsMin: positive(p.bedroomsMin, 20) && Math.round(positive(p.bedroomsMin, 20)!),
    bathroomsMin: positive(p.bathroomsMin, 20) && Math.round(positive(p.bathroomsMin, 20)!),
    areaMin: positive(p.areaMin, 100000),
    areaMax: positive(p.areaMax, 100000),
    areas: list(p.areas),
    nearMetro: p.nearMetro === true || undefined,
    metro: list(p.metro),
    notFirstFloor: p.notFirstFloor === true || undefined,
    notLastFloor: p.notLastFloor === true || undefined,
    features: list(p.features)?.filter((k) => FEATURES.some((f) => f.key === k)),
    pets: p.pets === true || undefined,
    leaseTerm: typeof p.leaseTerm === "string" && /^\d+\+$/.test(p.leaseTerm) ? p.leaseTerm : undefined,
  };
}

/** The request in one Georgian line for agents (CRM notes, Telegram). */
export function prefsSummary(p: SearchPrefs): string {
  const money = (n: number) => `$${n.toLocaleString("en-US")}`;
  return [
    p.deal ? DEAL_LABEL[p.deal === "sale" ? "sale" : p.deal === "daily" ? "daily" : "rent"].ka : "",
    p.types?.length ? p.types.map((type) => typeLabel(type, "ka")).join("/") : "",
    p.budgetMin && p.budgetMax ? `${money(p.budgetMin)}–${money(p.budgetMax)}` : p.budgetMax ? `მდე ${money(p.budgetMax)}` : p.budgetMin ? `${money(p.budgetMin)}-დან` : "",
    p.roomsMin ? `${p.roomsMin}+ ოთახი` : "",
    p.bedroomsMin ? `${p.bedroomsMin}+ საძინებელი` : "",
    p.bathroomsMin ? `${p.bathroomsMin}+ სველი წერტ.` : "",
    p.areaMin || p.areaMax ? `${p.areaMin ?? ""}–${p.areaMax ?? ""} მ²` : "",
    p.areas?.length ? p.areas.join(", ") : "",
    p.metro?.length ? `მეტრო: ${p.metro.map((id) => metroName(id, "ka")).join(", ")}` : p.nearMetro ? "მეტროსთან" : "",
    p.notFirstFloor ? "არა 1-ლი სართ." : "",
    p.notLastFloor ? "არა ბოლო სართ." : "",
    p.features?.length ? p.features.map((k) => FEATURES.find((f) => f.key === k)?.ka ?? k).join(", ") : "",
    p.pets ? "🐾 ცხოველით" : "",
    p.leaseTerm ? `ვადა: ${termText(p.leaseTerm, "ka")}` : "",
  ].filter(Boolean).join(" · ");
}

const MAX_AGE_DAYS = 90;

const TEXT = {
  title: { ka: "🔔 ახალი ბინა თქვენი მოთხოვნით", en: "🔔 A new flat matching your request", ru: "🔔 Новая квартира по вашему запросу" },
  open: { ka: "🏠 ბინის ნახვა", en: "🏠 View the flat", ru: "🏠 Смотреть квартиру" },
  stop: { ka: "შეტყობინებების გასათიშად გამოგზავნეთ /stop", en: "To stop these alerts, send /stop", ru: "Чтобы отключить уведомления, отправьте /stop" },
} satisfies Record<string, Record<Lang, string>>;

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function parsePrefs(value: string | null): SearchPrefs | null {
  try {
    return value ? (JSON.parse(value) as SearchPrefs) : null;
  } catch {
    return null;
  }
}

type Flat = {
  dealType: string | null; propertyType: string | null; price: number | null; currency: string; rooms: number | null; bedrooms: number | null; bathrooms: number | null;
  area: number | null; floor: number | null; totalFloors: number | null; district: string | null; location: string | null; pets: string | null;
  features: string; leaseTerm: string | null; lat: number | null; lng: number | null;
};

/** Budget, rooms, place and metro must be met; extras the flat does not state (bedrooms, area, floor…) do not rule it out. */
export function prefsMatch(prefs: SearchPrefs, flat: Flat): boolean {
  if (prefs.deal && prefs.deal !== dealKind(flat.dealType)) return false;
  if (prefs.types?.length && !prefs.types.includes(flat.propertyType || "ბინა")) return false;
  const usd = priceUsd(flat.price, flat.currency);
  if (prefs.budgetMax && (usd == null || usd > prefs.budgetMax)) return false;
  if (prefs.budgetMin && usd != null && usd < prefs.budgetMin) return false;
  if (prefs.roomsMin && (flat.rooms == null || flat.rooms < prefs.roomsMin)) return false;
  if (prefs.bedroomsMin && flat.bedrooms != null && flat.bedrooms < prefs.bedroomsMin) return false;
  if (prefs.bathroomsMin && flat.bathrooms != null && flat.bathrooms < prefs.bathroomsMin) return false;
  if (prefs.areaMin && flat.area != null && flat.area < prefs.areaMin) return false;
  if (prefs.areaMax && flat.area != null && flat.area > prefs.areaMax) return false;
  if (prefs.areas?.length) {
    const place = `${flat.district ?? ""} ${flat.location ?? ""}`;
    if (!prefs.areas.some((area) => place.includes(area))) return false;
  }
  if (prefs.nearMetro || prefs.metro?.length) {
    const near = metroNearby(flat.lat, flat.lng, 15);
    if (prefs.metro?.length ? !near.some((m) => prefs.metro!.includes(m.id)) : !near.some((m) => m.minutes <= 10)) return false;
  }
  if (prefs.notFirstFloor && flat.floor === 1) return false;
  if (prefs.notLastFloor && flat.floor != null && flat.totalFloors != null && flat.floor >= flat.totalFloors) return false;
  if (prefs.features?.length) {
    const has = featureList(flat.features);
    if (!prefs.features.every((k) => has.includes(k))) return false;
  }
  if (prefs.pets && flat.pets !== "yes" && flat.pets !== "ask") return false;
  // The client's planned stay must reach the flat's minimum lease ("6+" flat, "3+" stay → no).
  if (prefs.leaseTerm && flat.leaseTerm && parseInt(flat.leaseTerm) > parseInt(prefs.leaseTerm)) return false;
  return true;
}

/** Message the clients whose request matches this flat; returns how many got it. */
export async function alertMatchingClients(postId: string): Promise<number> {
  const post = await prisma.sharedPost.findUnique({ where: { id: postId }, include: { photos: { orderBy: [{ position: "asc" }, { id: "asc" }], take: 1, select: { id: true } } } });
  if (!post?.catalog || !post.refNo || post.availability !== "available") return 0;
  const ref = String(post.refNo);
  const leads = await prisma.catalogLead.findMany({
    where: { kind: "search", alerts: true, tgUserId: { not: null }, createdAt: { gte: new Date(Date.now() - MAX_AGE_DAYS * 86400_000) } },
    orderBy: { createdAt: "desc" },
  });

  // One message per person, even with several requests.
  const byUser = new Map<string, typeof leads>();
  for (const lead of leads) byUser.set(lead.tgUserId!, [...(byUser.get(lead.tgUserId!) ?? []), lead]);

  const settings = await getSettings();
  const base = await shareBase(settings.public_base_url);
  let sent = 0;
  for (const [chatId, list] of byUser) {
    if (list.some((lead) => lead.alertedRefs.split(",").includes(ref))) continue;
    const lead = list.find((l) => {
      const prefs = parsePrefs(l.prefs);
      return prefs ? prefsMatch(prefs, post) : false;
    });
    if (!lead) continue;
    const lang = asLang(lead.lang);
    const place = placeName(post.location || post.district, lang);
    const caption = [
      `<b>${TEXT.title[lang]}</b>`,
      "",
      `🏠 ${esc(headline(post, lang))}`,
      `💰 <b>${esc(priceText(post.price, post.currency, dealKind(post.dealType), lang))}</b>`,
      place ? `📍 ${esc(place)}` : "",
      metroLine(post, lang),
      `🆔 ${post.refNo}`,
      "",
      `<i>${TEXT.stop[lang]}</i>`,
    ].filter((line, i, all) => line !== "" || all[i - 1] !== "").join("\n");
    const reply_markup = { inline_keyboard: [[{ text: TEXT.open[lang], url: catalogLink(settings, base, post.refNo, lang, "a") }]] };
    const photo = post.photos[0] && base.startsWith("https://") ? `${base}${photoUrl(post.photos[0].id)}` : null;
    let result = photo ? await callVerbose("sendPhoto", { chat_id: chatId, photo, caption, parse_mode: "HTML", reply_markup }) : null;
    if (!result?.ok) result = await callVerbose("sendMessage", { chat_id: chatId, text: caption, parse_mode: "HTML", reply_markup, link_preview_options: { is_disabled: true } });
    if (!result.ok) {
      // The client blocked the bot or never allowed messages: stop trying.
      if (/blocked|deactivated|chat not found|can't initiate/i.test(result.error)) await prisma.catalogLead.updateMany({ where: { tgUserId: chatId }, data: { alerts: false } });
      continue;
    }
    await prisma.catalogLead.update({ where: { id: lead.id }, data: { alertedRefs: [lead.alertedRefs, ref].filter(Boolean).join(",") } });
    sent++;
  }
  return sent;
}

export async function stopAlerts(tgUserId: string): Promise<number> {
  const result = await prisma.catalogLead.updateMany({ where: { tgUserId, alerts: true }, data: { alerts: false } });
  return result.count;
}
