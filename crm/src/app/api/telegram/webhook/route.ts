import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { shareBase } from "@/lib/shareUrl";
import { asLang } from "@/lib/catalog";
import { call, connectRecipient, webhookSecret } from "@/lib/telegram";

// Telegram sends the bot's messages here once the webhook is turned on from
// the "არხი და აპი" page: /start <code> links an alert phone, any other
// /start (or text) answers with a button that opens the mini app.

type Update = { message?: { text?: string; chat: { id: number; type: string }; from?: { language_code?: string } } };

const WELCOME = {
  ka: "გამარჯობა! 🏠 აქ ნახავ ჩვენს ყველა ბინას — ფილტრებით, რუკით და ფოტოებით. ჩვენების მოთხოვნა ერთ წუთში შეგიძლია.",
  en: "Hi! 🏠 Browse all our apartments here — with filters, a map and photos. You can request a viewing in a minute.",
  ru: "Здравствуйте! 🏠 Здесь все наши квартиры — с фильтрами, картой и фото. Запросить просмотр можно за минуту.",
};
const OPEN = { ka: "🔎 ბინების ნახვა", en: "🔎 Browse listings", ru: "🔎 Смотреть квартиры" };
const OPEN_ONE = { ka: "🏠 ამ ბინის ნახვა", en: "🏠 Open this listing", ru: "🏠 Открыть объект" };

export async function POST(request: Request) {
  if (request.headers.get("x-telegram-bot-api-secret-token") !== webhookSecret()) return new Response("forbidden", { status: 403 });
  const update = (await request.json().catch(() => ({}))) as Update;
  const message = update.message;
  if (!message?.text || message.chat.type !== "private") return Response.json({ ok: true });
  const chatId = String(message.chat.id);
  const text = message.text.trim();

  const code = text.match(/^\/start\s+([a-f0-9]{12})\b/);
  if (code) {
    if (await connectRecipient(code[1], chatId)) return Response.json({ ok: true });
  }

  const lang = asLang(message.from?.language_code);
  const settings = await getSettings();
  const base = await shareBase(settings.public_base_url);
  const ref = text.match(/^\/start\s+p(\d+)/)?.[1];
  const post = ref ? await prisma.sharedPost.findFirst({ where: { refNo: Number(ref), catalog: true }, select: { refNo: true } }) : null;
  const url = post ? `${base}/catalog?p=${post.refNo}` : `${base}/catalog`;
  await call("sendMessage", {
    chat_id: chatId,
    text: WELCOME[lang],
    reply_markup: { inline_keyboard: [[{ text: post ? OPEN_ONE[lang] : OPEN[lang], web_app: { url } }]] },
  });
  return Response.json({ ok: true });
}
