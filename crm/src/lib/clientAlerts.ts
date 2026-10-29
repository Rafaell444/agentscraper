import { prisma } from "./db";
import { getSettings } from "./settings";
import { shareBase } from "./shareUrl";
import { asLang, dealKind, headline, metroLine, placeName, priceText, priceUsd, type Lang } from "./catalog";
import { catalogLink } from "./channel";
import { callVerbose } from "./telegram";

// "Find me a flat" alerts: when a flat is added to the mini app, every client
// whose saved request matches it gets a bot message with a button that opens
// the flat.  Each client gets each flat once; /stop turns alerts off.

export type SearchPrefs = { deal?: string; budgetMax?: number; roomsMin?: number; areas?: string[]; pets?: boolean };

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

type Flat = { dealType: string | null; price: number | null; currency: string; rooms: number | null; district: string | null; location: string | null; pets: string | null };

export function prefsMatch(prefs: SearchPrefs, flat: Flat): boolean {
  if (prefs.deal && prefs.deal !== dealKind(flat.dealType)) return false;
  if (prefs.budgetMax) {
    const usd = priceUsd(flat.price, flat.currency);
    if (usd == null || usd > prefs.budgetMax) return false;
  }
  if (prefs.roomsMin && (flat.rooms == null || flat.rooms < prefs.roomsMin)) return false;
  if (prefs.areas?.length) {
    const place = `${flat.district ?? ""} ${flat.location ?? ""}`;
    if (!prefs.areas.some((area) => place.includes(area))) return false;
  }
  if (prefs.pets && flat.pets !== "yes" && flat.pets !== "ask") return false;
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
    const reply_markup = { inline_keyboard: [[{ text: TEXT.open[lang], url: catalogLink(settings, base, post.refNo, lang) }]] };
    const photo = post.photos[0] && base.startsWith("https://") ? `${base}/api/catalog/photo/${post.photos[0].id}` : null;
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
