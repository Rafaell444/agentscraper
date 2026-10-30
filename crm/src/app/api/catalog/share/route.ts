import { prisma } from "@/lib/db";
import { asLang, dealKind, headline, metroLine, placeName, priceText } from "@/lib/catalog";
import { catalogLink } from "@/lib/channel";
import { getSettings } from "@/lib/settings";
import { shareBase } from "@/lib/shareUrl";
import { callVerbose, verifyInitData } from "@/lib/telegram";

// "Share" in the mini app: the bot prepares a card (photo, price, an Open
// button) that the user sends to any chat with Telegram's own picker.

const OPEN = { ka: "🏠 ნახვა", en: "🏠 Open", ru: "🏠 Открыть" };

export async function POST(request: Request) {
  const body = ((await request.json().catch(() => ({}))) ?? {}) as { ref?: number; lang?: string; initData?: string };
  const user = verifyInitData(body.initData ?? "");
  if (!user) return Response.json({ ok: false, error: "telegram only" }, { status: 401 });
  const lang = asLang(body.lang);
  const post = await prisma.sharedPost.findFirst({
    where: { refNo: Number(body.ref) || -1, catalog: true },
    include: { photos: { where: { kind: "photo" }, orderBy: [{ position: "asc" }, { id: "asc" }], take: 1, select: { id: true } } },
  });
  if (!post) return Response.json({ ok: false, error: "not found" }, { status: 404 });
  const settings = await getSettings();
  const base = await shareBase(settings.public_base_url);
  const kind = dealKind(post.dealType);
  const place = placeName(post.location || post.district, lang);
  const caption = [
    `🏠 <b>${escape(headline(post, lang))}</b>`,
    `💰 <b>${escape(priceText(post.price, post.currency, kind, lang))}</b>${post.area ? ` · ${post.area} ${lang === "ka" ? "მ²" : lang === "ru" ? "м²" : "m²"}` : ""}`,
    place ? `📍 ${escape(place)}` : "",
    metroLine(post, lang),
    `🆔 ${post.refNo}`,
  ].filter(Boolean).join("\n");
  const reply_markup = { inline_keyboard: [[{ text: OPEN[lang], url: catalogLink(settings, base, post.refNo, lang, "s") }]] };
  const photo = post.photos[0] ? `${base}/api/catalog/photo/${post.photos[0].id}` : null;
  const result = photo
    ? { type: "photo", id: `p${post.refNo}`, photo_url: photo, thumbnail_url: photo, caption, parse_mode: "HTML", reply_markup }
    : { type: "article", id: `p${post.refNo}`, title: headline(post, lang), input_message_content: { message_text: caption, parse_mode: "HTML" }, reply_markup };
  const saved = await callVerbose<{ id: string }>("savePreparedInlineMessage", {
    user_id: user.id,
    result,
    allow_user_chats: true,
    allow_bot_chats: false,
    allow_group_chats: true,
    allow_channel_chats: true,
  });
  if (!saved.ok) return Response.json({ ok: false, error: saved.error }, { status: 502 });
  return Response.json({ ok: true, id: saved.result.id });
}

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
