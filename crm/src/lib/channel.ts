import { prisma } from "./db";
import { getSettings } from "./settings";
import { shareBase } from "./shareUrl";
import { asLang, channelCaption, type CaptionLinks, type Lang } from "./catalog";
import { callVerbose, deleteMessages, editPostCaption, postAlbum } from "./telegram";
import { watermark } from "./watermark";

// Posting catalog listings to the agency's Telegram channel.  The bot must be
// an admin of the channel (telegram_channel setting).

export function managerLink(value: string): string | null {
  const name = value.trim().replace(/^https?:\/\/t\.me\//, "").replace(/^@/, "");
  return /^[A-Za-z0-9_]{4,}$/.test(name) ? `https://t.me/${name}` : null;
}

/** Link that opens one listing (ref) or the whole catalog: the Telegram mini
 * app when mini_app_link is set, else the web page.  With lang the app opens
 * in that language (channel posts link to their own language). */
/** src marks where the link was posted, for the stats page: c channel, a bot alert, s share, w website. */
export type LinkSource = "c" | "a" | "s" | "w";

export function catalogLink(settings: { mini_app_link: string }, base: string, ref?: number | null, lang?: Lang, src?: LinkSource): string {
  return appLink(settings, base, ref ? `p${ref}` : "home", lang, src);
}

/** Link that opens the catalog straight on the map tab. */
export function mapLink(settings: { mini_app_link: string }, base: string, lang?: Lang, src?: LinkSource): string {
  return appLink(settings, base, "map", lang, src);
}

// The mini app reads start params like "p1001_ru_c", "home_en", "map_ru";
// the web page reads ?p=, ?tab=map, ?lang= and ?src=.
function appLink(settings: { mini_app_link: string }, base: string, start: string, lang?: Lang, src?: LinkSource): string {
  const app = settings.mini_app_link.trim();
  if (app) return `${app}${app.includes("?") ? "&" : "?"}startapp=${start}${lang ? `_${lang}` : ""}${src ? `_${src}` : ""}`;
  const query = new URLSearchParams();
  if (start.startsWith("p")) query.set("p", start.slice(1));
  if (start === "map") query.set("tab", "map");
  if (lang) query.set("lang", lang);
  if (src) query.set("src", src);
  return `${base}/catalog${query.size ? `?${query}` : ""}`;
}

export async function captionLinks(ref: number | null, lang?: Lang, inCatalog = true): Promise<CaptionLinks> {
  const settings = await getSettings();
  const base = await shareBase(settings.public_base_url);
  return { details: inCatalog ? catalogLink(settings, base, ref, lang, "c") : null, catalog: catalogLink(settings, base, null, lang, "c"), manager: managerLink(settings.catalog_manager) };
}

export async function ensureRefNo(postId: string): Promise<number> {
  // Called whenever a flat goes public; the first time is its "listed" date in the app.
  await prisma.sharedPost.updateMany({ where: { id: postId, catalogAt: null }, data: { catalogAt: new Date() } });
  const post = await prisma.sharedPost.findUniqueOrThrow({ where: { id: postId }, select: { refNo: true } });
  if (post.refNo) return post.refNo;
  for (let attempt = 0; attempt < 5; attempt++) {
    const top = await prisma.sharedPost.aggregate({ _max: { refNo: true } });
    const next = Math.max(1000, top._max.refNo ?? 1000) + 1 + attempt;
    await prisma.sharedPost.update({ where: { id: postId }, data: { refNo: next } });
    // Two posts numbered at the same moment: the later one takes another number.
    const clash = await prisma.sharedPost.findFirst({ where: { refNo: next, id: { not: postId } }, select: { id: true } });
    if (!clash) return next;
  }
  throw new Error("could not assign a number");
}


export type ChannelTarget = { lang: Lang; chat: string };

/** The channels a listing goes to, one per language (Russian, English, Georgian). */
export function channelTargets(settings: Record<string, string>): ChannelTarget[] {
  const list: ChannelTarget[] = [
    { lang: "ru", chat: (settings.telegram_channel ?? "").trim() },
    { lang: "en", chat: (settings.telegram_channel_en ?? "").trim() },
  ];
  return list.filter((t) => t.chat);
}

export const CHANNEL_FLAG: Record<Lang, string> = { ru: "🇷🇺 RU", en: "🇬🇧 EN", ka: "🇬🇪 KA" };

/** channelMessageIds is "ru=11,12,13|en=40,41"; an older plain "11,12,13" belongs to the Russian channel. */
export function parseChannelIds(value: string | null | undefined): Partial<Record<Lang, number[]>> {
  const result: Partial<Record<Lang, number[]>> = {};
  for (const part of (value ?? "").split("|").filter(Boolean)) {
    const [key, ids] = part.includes("=") ? part.split("=") : ["ru", part];
    const lang = asLang(key);
    const numbers = ids.split(",").map(Number).filter(Boolean);
    if (numbers.length) result[lang] = numbers;
  }
  return result;
}

function formatChannelIds(map: Partial<Record<Lang, number[]>>): string | null {
  const parts = Object.entries(map).filter(([, ids]) => ids?.length).map(([lang, ids]) => `${lang}=${ids!.join(",")}`);
  return parts.length ? parts.join("|") : null;
}

export type ChannelResult = { ok: true; message: string } | { ok: false; error: string };

/** Post the listing to every channel it is not in yet and refresh the caption
 * where it already is.  With onlyExisting, only refresh (used after edits). */
export async function publishToChannel(postId: string, onlyExisting = false): Promise<ChannelResult> {
  const targets = channelTargets(await getSettings());
  if (!targets.length) return { ok: false, error: "პარამეტრებში Telegram არხი არ არის მითითებული." };
  const ref = await ensureRefNo(postId);
  const post = await prisma.sharedPost.findUniqueOrThrow({ where: { id: postId } });
  const posted = parseChannelIds(post.channelMessageIds);
  let photos: { mime: string; data: Uint8Array }[] | null = null;
  let isText = post.channelIsText;
  const done: string[] = [];
  const errors: string[] = [];

  for (const target of targets) {
    const caption = channelCaption(post, target.lang, await captionLinks(ref, target.lang, post.catalog));
    const ids = posted[target.lang];
    if (ids?.length) {
      const edited = await editPostCaption(target.chat, ids[0], caption, post.channelIsText);
      if (edited.ok || /not modified/i.test(edited.error)) done.push(`${CHANNEL_FLAG[target.lang]} განახლდა`);
      else errors.push(`${CHANNEL_FLAG[target.lang]}: ${edited.error}`);
      continue;
    }
    if (onlyExisting) continue;
    // Watermarked once, then the same album goes to every channel.
    photos ??= await Promise.all(
      (await prisma.sharedPostPhoto.findMany({ where: { postId }, orderBy: [{ position: "asc" }, { id: "asc" }], take: 10, select: { mime: true, data: true } })).map((p) => watermark(p.data)),
    );
    const sent = await postAlbum(target.chat, caption, photos);
    if (!sent.ok) {
      errors.push(`${CHANNEL_FLAG[target.lang]}: ${sent.error}`);
      continue;
    }
    posted[target.lang] = sent.ids;
    isText = sent.text;
    done.push(`${CHANNEL_FLAG[target.lang]} გამოქვეყნდა`);
  }

  if (!onlyExisting) {
    await prisma.sharedPost.update({
      where: { id: postId },
      data: { channelMessageIds: formatChannelIds(posted), channelIsText: isText, channelPostedAt: post.channelPostedAt ?? (done.length ? new Date() : null) },
    });
  }
  if (errors.length && !done.length) return { ok: false, error: `Telegram — ${errors.join("; ")}` };
  return { ok: true, message: [done.join(", "), errors.length ? `შეცდომა: ${errors.join("; ")}` : ""].filter(Boolean).join(". ") || "ცვლილება არ იყო." };
}

/** Refresh the captions after a change (e.g. "rented"); silent when not posted. */
export async function refreshChannelPost(postId: string): Promise<void> {
  const post = await prisma.sharedPost.findUnique({ where: { id: postId }, select: { channelMessageIds: true } });
  if (post?.channelMessageIds) await publishToChannel(postId, true).catch(() => undefined);
}

/** Delete the listing's posts from every channel, or only from one language's channel. */
export async function removeFromChannel(postId: string, only?: Lang): Promise<ChannelResult> {
  const targets = channelTargets(await getSettings());
  const post = await prisma.sharedPost.findUniqueOrThrow({ where: { id: postId }, select: { channelMessageIds: true } });
  const posted = parseChannelIds(post.channelMessageIds);
  const failed: string[] = [];
  const removed: string[] = [];
  for (const [lang, ids] of Object.entries(posted) as [Lang, number[]][]) {
    if (only && lang !== only) continue;
    const target = targets.find((t) => t.lang === lang);
    const deleted = target ? await deleteMessages(target.chat, ids) : { ok: false as const, error: "არხი პარამეტრებში აღარ არის" };
    if (!deleted.ok) failed.push(`${CHANNEL_FLAG[lang]}: ${deleted.error}`);
    removed.push(CHANNEL_FLAG[lang]);
    delete posted[lang];
  }
  const left = formatChannelIds(posted);
  await prisma.sharedPost.update({ where: { id: postId }, data: left ? { channelMessageIds: left } : { channelMessageIds: null, channelPostedAt: null, channelIsText: false } });
  const warning = failed.length ? ` (ვერ წაიშალა — ${failed.join("; ")}; წაშალე არხში ხელით)` : "";
  return { ok: true, message: `${removed.length ? `${removed.join(", ")}: ` : ""}არხიდან წაიშალა.${warning}` };
}

// Welcome post: a message the bot sends itself, so it can carry "Open App"
// buttons (posts written by hand in Telegram cannot).  Pinned, its first
// button shows on the pinned bar.  Stored per language in the settings table.

export type WelcomePost = { chat: string; id: number; photo: boolean; text: string; button: string };

export const WELCOME_DEFAULTS: Record<"ru" | "en", Omit<WelcomePost, "chat" | "id" | "photo">> = {
  ru: {
    text: "👋 Добро пожаловать в **Тбилиси Home**!\n\nПомогаем снять или купить квартиру в Тбилиси.\n\n✅ **Только проверенные объявления**: реальные фото, честные цены в $ и ₾.\n\n🔎 **Быстрый поиск в приложении**: фильтры по цене, районам и комнатам, карта, избранное.\n\n📩 **Понравилась квартира?** Отправьте её ID менеджеру или нажмите «Запросить просмотр» в приложении.\n\n🔔 Включите уведомления, чтобы не пропустить новые квартиры.",
    button: "🏠 Открыть приложение",
  },
  en: {
    text: "👋 Welcome to **Tbilisi Home**!\n\nWe help you rent or buy an apartment in Tbilisi.\n\n✅ **Verified listings only**: real photos, honest prices in $ and ₾.\n\n🔎 **Find faster in our app**: filters by price, district and rooms, a map, and saved favourites.\n\n📩 **Found one you like?** Send the listing ID to our manager or tap “Request a viewing” in the app.\n\n🔔 Turn on notifications so you never miss a new listing.",
    button: "🏠 Open App",
  },
};

export async function getWelcome(lang: Lang): Promise<WelcomePost | null> {
  const row = await prisma.setting.findUnique({ where: { key: `welcome_${lang}` } });
  try {
    return row ? (JSON.parse(row.value) as WelcomePost) : null;
  } catch {
    return null;
  }
}

/** Escape for Telegram HTML and turn **bold** into <b>bold</b>. */
function welcomeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}

/** One button only: Telegram shows it on the pinned bar only when the post has a single button. */
export async function publishWelcome(input: { lang: Lang; text: string; button: string; pin: boolean; fresh: boolean; photo: File | null }): Promise<ChannelResult> {
  const settings = await getSettings();
  const target = channelTargets(settings).find((t) => t.lang === input.lang);
  if (!target) return { ok: false, error: "ამ ენის არხი პარამეტრებში არ არის." };
  const text = input.text.trim();
  if (!text) return { ok: false, error: "ტექსტი ცარიელია." };
  const base = await shareBase(settings.public_base_url);
  const button = input.button.trim() || WELCOME_DEFAULTS[input.lang === "ru" ? "ru" : "en"].button;
  const reply_markup = { inline_keyboard: [[{ text: button, url: catalogLink(settings, base, null, input.lang, "c") }]] };
  const html = welcomeHtml(text);
  const visible = text.split("**").join("").length; // Telegram counts the caption without markup
  const photo = input.photo && input.photo.size > 0 ? input.photo : null;
  const tooLong = `ფოტოიან პოსტში ტექსტი მაქს. 1024 სიმბოლოა (ახლა ${visible}). შეამოკლე.`;

  const old = await getWelcome(input.lang);
  let id = 0;
  let hasPhoto = false;
  let updated = false;
  if (old && old.chat === target.chat && !input.fresh && !photo) {
    if (old.photo && visible > 1024) return { ok: false, error: tooLong };
    const edited = old.photo
      ? await callVerbose("editMessageCaption", { chat_id: target.chat, message_id: old.id, caption: html, parse_mode: "HTML", reply_markup })
      : await callVerbose("editMessageText", { chat_id: target.chat, message_id: old.id, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup });
    if (edited.ok || /not modified/i.test(edited.error)) {
      id = old.id;
      hasPhoto = old.photo;
      updated = true;
    } else if (!/not found/i.test(edited.error)) {
      return { ok: false, error: `Telegram — ${edited.error}` };
    }
    // "message to edit not found": it was deleted in Telegram, so post a new one below.
  }
  if (!updated) {
    if (photo && visible > 1024) return { ok: false, error: tooLong };
    let sent;
    if (photo) {
      const form = new FormData();
      form.set("chat_id", target.chat);
      form.set("photo", photo, photo.name || "welcome.jpg");
      form.set("caption", html);
      form.set("parse_mode", "HTML");
      form.set("reply_markup", JSON.stringify(reply_markup));
      sent = await callVerbose<{ message_id: number }>("sendPhoto", form);
    } else {
      sent = await callVerbose<{ message_id: number }>("sendMessage", { chat_id: target.chat, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup });
    }
    if (!sent.ok) return { ok: false, error: `Telegram — ${sent.error}` };
    id = sent.result.message_id;
    hasPhoto = Boolean(photo);
    // A new post replaces the previous welcome in the same channel.
    if (old && old.chat === target.chat && old.id !== id) await deleteMessages(old.chat, [old.id]);
  }

  let pinNote = "";
  if (input.pin) {
    const pinned = await callVerbose("pinChatMessage", { chat_id: target.chat, message_id: id, disable_notification: true });
    pinNote = pinned.ok ? " და მიმაგრდა 📌" : ` (ვერ მიმაგრდა: ${pinned.error} — ბოტს „Edit messages“ უფლება სჭირდება)`;
  }
  const saved: WelcomePost = { chat: target.chat, id, photo: hasPhoto, text, button };
  await prisma.setting.upsert({ where: { key: `welcome_${input.lang}` }, create: { key: `welcome_${input.lang}`, value: JSON.stringify(saved) }, update: { value: JSON.stringify(saved) } });
  return { ok: true, message: `${CHANNEL_FLAG[input.lang]}: ${updated ? "განახლდა" : "გამოქვეყნდა"}${pinNote}` };
}
