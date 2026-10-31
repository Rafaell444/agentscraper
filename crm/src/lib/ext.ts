// The Chrome extension ("Tbilisi Home — CRM helper", folder /extension):
// it reads MyHome owner numbers in an agent's own Chrome (MyHome shows them
// to a real browser with one click) and saves them here.  Each agent has a
// personal key (User.extToken) that the extension sends as a Bearer token.

import { randomBytes } from "node:crypto";
import { prisma } from "./db";

export async function extUser(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return prisma.user.findFirst({ where: { extToken: token, active: true }, select: { id: true, name: true } });
}

export async function newExtToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await prisma.user.update({ where: { id: userId }, data: { extToken: token } });
  return token;
}

/** "593123131", "+995 593 12 31 31; 577…" → "593123131; 577…" (Georgian mobiles, no country code). */
export function cleanPhones(value: unknown): string {
  const found = String(value ?? "").match(/(?:\+?995[\s-]*)?5\d{2}[\s-]?\d{2,3}[\s-]?\d{2,3}[\s-]?\d{0,3}/g) ?? [];
  const phones = found.map((p) => p.replace(/\D/g, "").replace(/^995/, "")).filter((p) => /^5\d{8}$/.test(p));
  return [...new Set(phones)].join("; ");
}

/** MyHome listing id from its URL: …/udzravi-qoneba/qiravdeba-…-26302196/ or …/pr/26302196/ */
export function myhomeId(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    return path.match(/(\d{6,})\/?$/)?.[1] ?? path.match(/\/pr\/(\d{6,})/)?.[1] ?? null;
  } catch {
    return null;
  }
}

// A failed or unfinished try is retried after 6 hours; "none" (no number on the listing) is not retried.
const RETRY_MS = 6 * 3600_000;
const RETRY = ["pending", "login", "blocked", "error"];

/** The next MyHome listings without a number (owners first, newest first), marked as taken for this agent. */
export async function phoneQueue(limit: number) {
  const retryBefore = new Date(Date.now() - RETRY_MS);
  const where = (owner: boolean) => ({
    site: "myhome",
    archived: false,
    link: { not: null },
    OR: [{ phone: null }, { phone: "" }],
    ...(owner ? { posterKind: "owner" } : { NOT: { posterKind: "owner" } }),
    AND: [
      {
        OR: [
          { lead: null },
          { lead: { manualPhone: null, phoneCheckedAt: null } },
          { lead: { manualPhone: null, phoneCheckedAt: { lt: retryBefore }, phoneCheck: { in: RETRY } } },
        ],
      },
    ],
  });
  const pick = { select: { id: true, link: true, posterKind: true, neighbourhood: true, district: true, rooms: true }, orderBy: { collectedAt: "desc" as const } };
  const owners = await prisma.listing.findMany({ where: where(true), take: limit, ...pick });
  const others = owners.length < limit ? await prisma.listing.findMany({ where: where(false), take: limit - owners.length, ...pick }) : [];
  const items = [...owners, ...others];
  const now = new Date();
  for (const item of items) {
    await prisma.lead.upsert({
      where: { listingId: item.id },
      update: { phoneCheck: "pending", phoneCheckedAt: now },
      create: { listingId: item.id, phoneCheck: "pending", phoneCheckedAt: now },
    });
  }
  // "ვაკე, 3 ოთახი": shown in the extension's log next to the number it found.
  const label = (i: (typeof items)[number]) => [i.neighbourhood || i.district, i.rooms ? `${i.rooms} ოთახი` : ""].filter(Boolean).join(", ");
  return items.map((i) => ({ id: i.id, url: i.link!, owner: i.posterKind === "owner", label: label(i) }));
}

export async function phoneQueueSize(): Promise<number> {
  const retryBefore = new Date(Date.now() - RETRY_MS);
  return prisma.listing.count({
    where: {
      site: "myhome",
      archived: false,
      OR: [{ phone: null }, { phone: "" }],
      AND: [{ OR: [{ lead: null }, { lead: { manualPhone: null, phoneCheckedAt: null } }, { lead: { manualPhone: null, phoneCheckedAt: { lt: retryBefore }, phoneCheck: { in: RETRY } } }] }],
    },
  });
}
