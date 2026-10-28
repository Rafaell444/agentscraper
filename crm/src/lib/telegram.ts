import { randomBytes } from "node:crypto";
import { prisma } from "./db";

// Telegram bot used for listing alerts.  TELEGRAM_BOT_TOKEN must be set both
// on Vercel (connect / test from the CRM) and as a GitHub secret (notify.py
// sends the alerts after each collector run).

export function botToken(): string {
  return (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
}

async function call<T>(method: string, body?: Record<string, unknown>): Promise<T | null> {
  const token = botToken();
  if (!token) return null;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    const json = (await response.json()) as { ok: boolean; result: T };
    return json.ok ? json.result : null;
  } catch {
    return null;
  }
}

export async function botUsername(): Promise<string | null> {
  const me = await call<{ username?: string }>("getMe");
  return me?.username ?? null;
}

export function newConnectCode(): string {
  return randomBytes(6).toString("hex");
}

export async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  const result = await call("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true });
  return result !== null;
}

type Update = { update_id: number; message?: { text?: string; chat: { id: number; first_name?: string; username?: string } } };

/** Read the bot's new messages and link recipients that sent /start <code>. */
export async function checkConnections(): Promise<number> {
  const updates = await call<Update[]>("getUpdates", { timeout: 0, allowed_updates: ["message"] });
  if (!updates?.length) return 0;
  let linked = 0;
  for (const update of updates) {
    const match = update.message?.text?.match(/^\/start\s+([a-f0-9]{12})\b/);
    if (!match || !update.message) continue;
    const recipient = await prisma.telegramRecipient.findUnique({ where: { connectCode: match[1] } });
    if (!recipient) continue;
    const chatId = String(update.message.chat.id);
    if (recipient.chatId !== chatId) {
      await prisma.telegramRecipient.update({ where: { id: recipient.id }, data: { chatId } });
      await sendTelegram(chatId, `✅ დაკავშირებულია: <b>${recipient.name}</b>\nახალი განცხადებები, რომლებიც ფილტრებს ემთხვევა, აქ მოვა.`);
      linked += 1;
    }
  }
  // Confirm the updates so the next check only sees new messages.
  await call("getUpdates", { offset: updates[updates.length - 1].update_id + 1, timeout: 0 });
  return linked;
}
