import { prisma } from "@/lib/db";
import { extUser } from "@/lib/ext";
import { sendTelegram } from "@/lib/telegram";

/**
 * The extension stopped and needs the agent (MyHome login, refusals, a site
 * check): a Telegram message to that agent, else to the alert recipients,
 * so it is seen even when Chrome's own notification is missed.
 */
export async function POST(request: Request) {
  const user = await extUser(request);
  if (!user) return Response.json({ ok: false, error: "bad key" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
  const reason = String(body.reason ?? "").slice(0, 400).replace(/[<>&]/g, "");
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { telegramChatId: true } });
  const chats = me?.telegramChatId
    ? [me.telegramChatId]
    : (await prisma.telegramRecipient.findMany({ where: { chatId: { not: null } }, select: { chatId: true } })).map((r) => r.chatId as string);
  const text = `🔴 <b>Chrome-ის გაფართოება გაჩერდა</b> (${user.name})\n\n${reason}\n\nგახსენი Chrome — იქ გაგიხსნა გვერდი, სადაც ერთი ღილაკით ჩართავ ისევ.`;
  let sent = 0;
  for (const chat of chats) if (await sendTelegram(chat, text)) sent += 1;
  return Response.json({ ok: true, sent });
}
