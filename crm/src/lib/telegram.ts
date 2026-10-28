import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";

// Telegram bot used for listing alerts.  TELEGRAM_BOT_TOKEN must be set both
// on Vercel (connect / test from the CRM) and as a GitHub secret (notify.py
// sends the alerts after each collector run).

export function botToken(): string {
  return (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
}

export async function call<T>(method: string, body?: Record<string, unknown>): Promise<T | null> {
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

/** Link a recipient that sent /start <code> to its chat; true when newly linked. */
export async function connectRecipient(code: string, chatId: string): Promise<boolean> {
  const recipient = await prisma.telegramRecipient.findUnique({ where: { connectCode: code } });
  if (!recipient || recipient.chatId === chatId) return false;
  await prisma.telegramRecipient.update({ where: { id: recipient.id }, data: { chatId } });
  await sendTelegram(chatId, `✅ დაკავშირებულია: <b>${recipient.name}</b>
ახალი განცხადებები, რომლებიც ფილტრებს ემთხვევა, აქ მოვა.`);
  return true;
}

type Update = { update_id: number; message?: { text?: string; chat: { id: number; first_name?: string; username?: string } } };

/** Read the bot's new messages and link recipients that sent /start <code>.
 * (When the webhook is on, Telegram delivers these to /api/telegram/webhook
 * instead and getUpdates returns nothing.) */
export async function checkConnections(): Promise<number> {
  const updates = await call<Update[]>("getUpdates", { timeout: 0, allowed_updates: ["message"] });
  if (!updates?.length) return 0;
  let linked = 0;
  for (const update of updates) {
    const match = update.message?.text?.match(/^\/start\s+([a-f0-9]{12})\b/);
    if (!match || !update.message) continue;
    if (await connectRecipient(match[1], String(update.message.chat.id))) linked += 1;
  }
  // Confirm the updates so the next check only sees new messages.
  await call("getUpdates", { offset: updates[updates.length - 1].update_id + 1, timeout: 0 });
  return linked;
}

/** Same as call(), but returns Telegram's error text too. */
export async function callVerbose<T>(method: string, body: Record<string, unknown> | FormData): Promise<{ ok: true; result: T } | { ok: false; error: string }> {
  const token = botToken();
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN არ არის" };
  try {
    const isForm = body instanceof FormData;
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: isForm ? undefined : { "Content-Type": "application/json" },
      body: isForm ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
      cache: "no-store",
    });
    const json = (await response.json()) as { ok: boolean; result: T; description?: string };
    return json.ok ? { ok: true, result: json.result } : { ok: false, error: json.description ?? `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export type AlbumPhoto = { mime: string; data: Uint8Array };

/** Post photos (max 10) as one album with the caption on the first photo;
 * without photos, a text message.  Returns the message ids. */
export async function postAlbum(chatId: string, caption: string, photos: AlbumPhoto[]) {
  if (!photos.length) {
    const sent = await callVerbose<{ message_id: number }>("sendMessage", { chat_id: chatId, text: caption, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
    return sent.ok ? { ok: true as const, ids: [sent.result.message_id], text: true } : sent;
  }
  const form = new FormData();
  form.set("chat_id", chatId);
  const media = photos.slice(0, 10).map((photo, i) => {
    form.set(`p${i}`, new Blob([Buffer.from(photo.data)], { type: photo.mime }), `p${i}.jpg`);
    return { type: "photo", media: `attach://p${i}`, ...(i === 0 ? { caption, parse_mode: "HTML" } : {}) };
  });
  form.set("media", JSON.stringify(media));
  const sent = await callVerbose<{ message_id: number }[]>("sendMediaGroup", form);
  return sent.ok ? { ok: true as const, ids: sent.result.map((m) => m.message_id), text: false } : sent;
}

export async function editPostCaption(chatId: string, messageId: number, caption: string, isText: boolean) {
  return isText
    ? callVerbose("editMessageText", { chat_id: chatId, message_id: messageId, text: caption, parse_mode: "HTML", link_preview_options: { is_disabled: true } })
    : callVerbose("editMessageCaption", { chat_id: chatId, message_id: messageId, caption, parse_mode: "HTML" });
}

export async function deleteMessages(chatId: string, ids: number[]) {
  return callVerbose("deleteMessages", { chat_id: chatId, message_ids: ids });
}

/** Secret Telegram echoes in X-Telegram-Bot-Api-Secret-Token on webhook calls. */
export function webhookSecret(): string {
  return createHash("sha256").update(`webhook:${botToken()}:${process.env.AUTH_SECRET ?? ""}`).digest("hex").slice(0, 48);
}

export type MiniAppUser = { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string };

/** Check the mini app's initData signature; returns the Telegram user when valid. */
export function verifyInitData(initData: string, maxAgeSeconds = 86400): MiniAppUser | null {
  const token = botToken();
  if (!token || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const checkString = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const expected = createHmac("sha256", secret).update(checkString).digest("hex");
  if (expected.length !== hash.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(hash))) return null;
  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) return null;
  try {
    return JSON.parse(params.get("user") ?? "null") as MiniAppUser | null;
  } catch {
    return null;
  }
}

/** Send a message to every connected alert recipient (agency phones). */
export async function notifyRecipients(text: string): Promise<number> {
  const recipients = await prisma.telegramRecipient.findMany({ where: { chatId: { not: null } }, select: { chatId: true } });
  let sent = 0;
  for (const r of recipients) if (r.chatId && (await sendTelegram(r.chatId, text))) sent += 1;
  return sent;
}
