// After a flat is published (mini app, Telegram channels, social networks),
// the bot tells the agent who pressed the button where it went, with links.

import { prisma } from "./db";
import { getSettings } from "./settings";
import { shareBase } from "./shareUrl";
import { sendTelegram } from "./telegram";
import { catalogLink, channelTargets, parseChannelIds, CHANNEL_FLAG } from "./channel";
import { headline } from "./catalog";
import { NETWORKS, NETWORK_LABEL, parseSocial } from "./social";

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A Telegram channel post link: @name → https://t.me/name/123 (private -100… channels have no public link). */
function channelPostUrl(chat: string, messageId: number): string | null {
  const name = chat.replace(/^@/, "").replace(/^https?:\/\/t\.me\//, "");
  return /^[A-Za-z][A-Za-z0-9_]{3,}$/.test(name) ? `https://t.me/${name}/${messageId}` : null;
}

export async function notifyPublished(userId: string, postId: string, notes: string[], failed: boolean): Promise<void> {
  const [user, post, settings] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { telegramChatId: true } }),
    prisma.sharedPost.findUnique({ where: { id: postId } }),
    getSettings(),
  ]);
  if (!post) return;
  const chats = user?.telegramChatId
    ? [user.telegramChatId]
    : (await prisma.telegramRecipient.findMany({ where: { chatId: { not: null } }, select: { chatId: true } })).map((r) => r.chatId as string);
  if (!chats.length) return;

  const base = await shareBase(settings.public_base_url);
  const lines: string[] = [];
  if (post.catalog && post.refNo) lines.push(`📱 <a href="${catalogLink(settings, base, post.refNo, "en", "c")}">მინი აპი</a>`);
  const posted = parseChannelIds(post.channelMessageIds);
  for (const target of channelTargets(settings)) {
    const id = posted[target.lang]?.[0];
    if (!id) continue;
    const url = channelPostUrl(target.chat, id);
    lines.push(url ? `📣 <a href="${url}">Telegram ${CHANNEL_FLAG[target.lang]}</a>` : `📣 Telegram ${CHANNEL_FLAG[target.lang]}`);
  }
  const social = parseSocial(post.socialPosts);
  for (const n of NETWORKS) {
    const done = social[n];
    if (done) lines.push(done.url ? `${NETWORK_LABEL[n].split(" ")[0]} <a href="${done.url}">${NETWORK_LABEL[n].split(" ").slice(1).join(" ")}</a>` : NETWORK_LABEL[n]);
  }
  // Problems from this press (not set up, refused by the network…), as the CRM showed them.
  const problems = notes.flatMap((n) => n.split(/\.\s+/)).filter((n) => /შეცდომა|არ არის დაყენებული|ვერ|error|failed/i.test(n));

  const text = [
    `${failed ? "⚠️" : "✅"} <b>გამოქვეყნდა${post.refNo ? ` #${post.refNo}` : ""}</b>`,
    esc(headline(post, "ka")),
    "",
    lines.length ? lines.join("\n") : "—",
    problems.length ? `\n⚠️ ${esc(problems.join("\n⚠️ "))}` : "",
    "",
    `<a href="${base}/shared/${post.id}">CRM-ში გახსნა</a>`,
  ].filter((line, i, all) => line !== "" || all[i - 1] !== "").join("\n");
  for (const chat of chats) await sendTelegram(chat, text);
}
