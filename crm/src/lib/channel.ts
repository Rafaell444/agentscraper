import { prisma } from "./db";
import { getSettings } from "./settings";
import { shareBase } from "./shareUrl";
import { asLang, channelCaption, type CaptionLinks, type Lang } from "./catalog";
import { deleteMessages, editPostCaption, postAlbum } from "./telegram";

// Posting catalog listings to the agency's Telegram channel.  The bot must be
// an admin of the channel (telegram_channel setting).

export function managerLink(value: string): string | null {
  const name = value.trim().replace(/^https?:\/\/t\.me\//, "").replace(/^@/, "");
  return /^[A-Za-z0-9_]{4,}$/.test(name) ? `https://t.me/${name}` : null;
}

/** Link that opens one listing (ref) or the whole catalog: the Telegram mini
 * app when mini_app_link is set, else the web page. */
export function catalogLink(settings: { mini_app_link: string }, base: string, ref?: number | null): string {
  const app = settings.mini_app_link.trim();
  if (app) {
    const param = ref ? `p${ref}` : "home";
    return `${app}${app.includes("?") ? "&" : "?"}startapp=${param}`;
  }
  return ref ? `${base}/catalog?p=${ref}` : `${base}/catalog`;
}

export async function captionLinks(ref: number | null): Promise<CaptionLinks> {
  const settings = await getSettings();
  const base = await shareBase(settings.public_base_url);
  return { details: catalogLink(settings, base, ref), catalog: catalogLink(settings, base), manager: managerLink(settings.catalog_manager) };
}

export async function ensureRefNo(postId: string): Promise<number> {
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
    { lang: "ka", chat: (settings.telegram_channel_ka ?? "").trim() },
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
  const links = await captionLinks(ref);
  const posted = parseChannelIds(post.channelMessageIds);
  let photos: { mime: string; data: Uint8Array }[] | null = null;
  let isText = post.channelIsText;
  const done: string[] = [];
  const errors: string[] = [];

  for (const target of targets) {
    const caption = channelCaption(post, target.lang, links);
    const ids = posted[target.lang];
    if (ids?.length) {
      const edited = await editPostCaption(target.chat, ids[0], caption, post.channelIsText);
      if (edited.ok || /not modified/i.test(edited.error)) done.push(`${CHANNEL_FLAG[target.lang]} განახლდა`);
      else errors.push(`${CHANNEL_FLAG[target.lang]}: ${edited.error}`);
      continue;
    }
    if (onlyExisting) continue;
    photos ??= await prisma.sharedPostPhoto.findMany({ where: { postId }, orderBy: [{ position: "asc" }, { id: "asc" }], take: 10, select: { mime: true, data: true } });
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
      data: { channelMessageIds: formatChannelIds(posted), channelIsText: isText, channelPostedAt: post.channelPostedAt ?? (done.length ? new Date() : null), catalog: true },
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

export async function removeFromChannel(postId: string): Promise<ChannelResult> {
  const targets = channelTargets(await getSettings());
  const post = await prisma.sharedPost.findUniqueOrThrow({ where: { id: postId }, select: { channelMessageIds: true } });
  const posted = parseChannelIds(post.channelMessageIds);
  const failed: string[] = [];
  for (const [lang, ids] of Object.entries(posted) as [Lang, number[]][]) {
    const target = targets.find((t) => t.lang === lang);
    const deleted = target ? await deleteMessages(target.chat, ids) : { ok: false as const, error: "არხი პარამეტრებში აღარ არის" };
    if (!deleted.ok) failed.push(`${CHANNEL_FLAG[lang]}: ${deleted.error}`);
  }
  await prisma.sharedPost.update({ where: { id: postId }, data: { channelMessageIds: null, channelPostedAt: null, channelIsText: false } });
  const warning = failed.length ? ` (ვერ წაიშალა — ${failed.join("; ")}; წაშალე არხში ხელით)` : "";
  return { ok: true, message: `არხებიდან მოიხსნა.${warning}` };
}
