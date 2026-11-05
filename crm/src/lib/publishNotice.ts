// After a flat is published (mini app, Telegram channels, social networks),
// the bot tells the agent where it is: one line per place with ✅ (link), ❌
// (and why) or ▫️ (not posted).  One message per flat and chat, edited on
// every later publish instead of sending a new one.

import { prisma } from "./db";
import { getSettings } from "./settings";
import { shareBase } from "./shareUrl";
import { callVerbose } from "./telegram";
import { catalogLink, channelTargets, parseChannelIds, CHANNEL_FLAG } from "./channel";
import { headline } from "./catalog";
import { NETWORKS, NETWORK_LABEL, parseSocial, socialStatus, type Network } from "./social";

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A Telegram channel post link: @name → https://t.me/name/123 (private -100… channels have no public link). */
function channelPostUrl(chat: string, messageId: number): string | null {
  const name = chat.replace(/^@/, "").replace(/^https?:\/\/t\.me\//, "");
  return /^[A-Za-z][A-Za-z0-9_]{3,}$/.test(name) ? `https://t.me/${name}/${messageId}` : null;
}

export type Requested = { app: boolean; tg: boolean; networks: readonly Network[] };

/** The part of this press's notes about one place ("📘 Facebook: …"), for the reason it failed. */
function reasonFor(notes: string[], label: string): string {
  const part = notes.flatMap((n) => n.split(/\.\s+|;\s+/)).find((n) => n.includes(label));
  return part ? part.replace(label, "").replace(/^[:\s—-]+/, "").trim().slice(0, 120) : "";
}

export async function notifyPublished(userId: string, postId: string, notes: string[], requested: Requested): Promise<void> {
  const [user, post, settings, ready] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { telegramChatId: true } }),
    prisma.sharedPost.findUnique({ where: { id: postId } }),
    getSettings(),
    socialStatus(),
  ]);
  if (!post) return;
  const chats = user?.telegramChatId
    ? [user.telegramChatId]
    : (await prisma.telegramRecipient.findMany({ where: { chatId: { not: null } }, select: { chatId: true } })).map((r) => r.chatId as string);
  if (!chats.length) return;

  const base = await shareBase(settings.public_base_url);
  const lines: string[] = [];
  let failures = 0;
  const line = (ok: boolean, wanted: boolean, label: string, url: string | null, reason = "") => {
    if (ok) return lines.push(`✅ ${url ? `<a href="${url}">${esc(label)}</a>` : esc(label)}`);
    if (wanted) {
      failures++;
      return lines.push(`❌ ${esc(label)}${reason ? ` — ${esc(reason)}` : ""}`);
    }
    lines.push(`▫️ ${esc(label)}`);
  };

  line(post.catalog, requested.app, "📱 მინი აპი", post.catalog && post.refNo ? catalogLink(settings, base, post.refNo, "en", "c") : null);
  const posted = parseChannelIds(post.channelMessageIds);
  for (const target of channelTargets(settings)) {
    const id = posted[target.lang]?.[0];
    const label = `📣 Telegram ${CHANNEL_FLAG[target.lang]}`;
    line(Boolean(id), requested.tg, label, id ? channelPostUrl(target.chat, id) : null, reasonFor(notes, CHANNEL_FLAG[target.lang]));
  }
  const social = parseSocial(post.socialPosts);
  for (const n of NETWORKS) {
    const done = social[n];
    // Networks not set up yet are listed only when they were asked for.
    if (!done && !ready[n].ready && !requested.networks.includes(n)) continue;
    line(Boolean(done), requested.networks.includes(n), NETWORK_LABEL[n], done?.url ?? null, reasonFor(notes, NETWORK_LABEL[n]));
  }

  const text = [
    `${failures ? "⚠️" : "✅"} <b>${post.refNo ? `#${post.refNo} ` : ""}${esc(headline(post, "ka"))}</b>`,
    "",
    ...lines,
    "",
    `🕐 ${new Date().toLocaleString("ka-GE", { timeZone: "Asia/Tbilisi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })} · <a href="${base}/shared/${post.id}">CRM-ში გახსნა</a>`,
  ].join("\n");

  // The same message is edited on later publishes; a new one only when it is gone.
  const key = `publish_notice:${post.id}`;
  const stored = await prisma.setting.findUnique({ where: { key } });
  const ids: Record<string, number> = stored ? (JSON.parse(stored.value) as Record<string, number>) : {};
  for (const chat of chats) {
    const body = { chat_id: chat, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } };
    if (ids[chat]) {
      const edited = await callVerbose("editMessageText", { ...body, message_id: ids[chat] });
      if (edited.ok || /not modified/i.test(edited.error)) continue;
    }
    const sent = await callVerbose<{ message_id: number }>("sendMessage", body);
    if (sent.ok) ids[chat] = sent.result.message_id;
  }
  await prisma.setting.upsert({ where: { key }, create: { key, value: JSON.stringify(ids) }, update: { value: JSON.stringify(ids) } });
}
