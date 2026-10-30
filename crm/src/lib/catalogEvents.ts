// Mini app actions for the stats page (lib/catalogStats): where people came
// from and what they did with each flat.

import { prisma } from "./db";

export const EVENT_KINDS = ["open", "view", "save", "share", "lead"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** channel_en / channel_ru: a link in that channel; alert: a bot message; share: a friend's link; site: the public website; bot / web: opened directly. */
export const SOURCES = ["channel_en", "channel_ru", "channel_ka", "alert", "share", "site", "bot", "web"] as const;
export type Source = (typeof SOURCES)[number];

export const SOURCE_LABEL: Record<string, string> = {
  channel_en: "🇬🇧 EN არხი",
  channel_ru: "🇷🇺 RU არხი",
  channel_ka: "🇬🇪 KA არხი",
  alert: "🔔 ბოტის შეტყობინება",
  share: "👥 მეგობრის გაზიარება",
  site: "🌐 საიტი (Google)",
  bot: "🤖 ბოტის მენიუ",
  web: "🔗 პირდაპირი ბმული",
};

export function asSource(value: unknown): Source {
  return SOURCES.includes(value as Source) ? (value as Source) : "web";
}

export async function recordEvent(kind: EventKind, source: Source, ref?: number | null) {
  const post = ref ? await prisma.sharedPost.findFirst({ where: { refNo: ref }, select: { id: true } }) : null;
  if (ref && !post) return;
  await prisma.catalogEvent.create({ data: { kind, source, postId: post?.id ?? null } });
  if (kind === "view" && post) await prisma.sharedPost.update({ where: { id: post.id }, data: { catalogViews: { increment: 1 } } });
}
