import { prisma } from "./db";
import { getSettings } from "./settings";
import { shareBase } from "./shareUrl";
import { asLang, channelCaption, type CaptionLinks } from "./catalog";
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

async function channelTarget() {
  const settings = await getSettings();
  return { chat: settings.telegram_channel.trim(), lang: asLang(settings.channel_lang || "ru") };
}

export type ChannelResult = { ok: true; message: string } | { ok: false; error: string };

/** Post the listing to the channel, or refresh its caption when already posted. */
export async function publishToChannel(postId: string): Promise<ChannelResult> {
  const { chat, lang } = await channelTarget();
  if (!chat) return { ok: false, error: "პარამეტრებში „Telegram არხი“ არ არის მითითებული." };
  const ref = await ensureRefNo(postId);
  const post = await prisma.sharedPost.findUniqueOrThrow({ where: { id: postId } });
  const caption = channelCaption(post, lang, await captionLinks(ref));
  const ids = (post.channelMessageIds ?? "").split(",").map(Number).filter(Boolean);
  if (ids.length) {
    const edited = await editPostCaption(chat, ids[0], caption, post.channelIsText);
    if (edited.ok || /not modified/i.test(edited.error)) return { ok: true, message: "არხში პოსტი განახლდა." };
    return { ok: false, error: `Telegram: ${edited.error}` };
  }
  const photos = await prisma.sharedPostPhoto.findMany({ where: { postId }, orderBy: [{ position: "asc" }, { id: "asc" }], take: 10, select: { mime: true, data: true } });
  const sent = await postAlbum(chat, caption, photos.map((p) => ({ mime: p.mime, data: p.data })));
  if (!sent.ok) return { ok: false, error: `Telegram: ${sent.error}` };
  await prisma.sharedPost.update({
    where: { id: postId },
    data: { channelMessageIds: sent.ids.join(","), channelIsText: sent.text, channelPostedAt: new Date(), catalog: true },
  });
  return { ok: true, message: "გამოქვეყნდა არხში." };
}

/** Refresh the caption after a change (e.g. "rented"); silent when not posted. */
export async function refreshChannelPost(postId: string): Promise<void> {
  const post = await prisma.sharedPost.findUnique({ where: { id: postId }, select: { channelMessageIds: true } });
  if (post?.channelMessageIds) await publishToChannel(postId).catch(() => undefined);
}

export async function removeFromChannel(postId: string): Promise<ChannelResult> {
  const { chat } = await channelTarget();
  const post = await prisma.sharedPost.findUniqueOrThrow({ where: { id: postId }, select: { channelMessageIds: true } });
  const ids = (post.channelMessageIds ?? "").split(",").map(Number).filter(Boolean);
  let warning = "";
  if (chat && ids.length) {
    const deleted = await deleteMessages(chat, ids);
    if (!deleted.ok) warning = ` (Telegram-მა ვერ წაშალა: ${deleted.error} — წაშალე არხში ხელით)`;
  }
  await prisma.sharedPost.update({ where: { id: postId }, data: { channelMessageIds: null, channelPostedAt: null, channelIsText: false } });
  return { ok: true, message: `არხიდან მოიხსნა.${warning}` };
}
