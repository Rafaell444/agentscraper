// Browser relay, CRM side (see /relay.py): the collector lists pages a site
// refused it (relay_requests); the Chrome extension downloads them from an
// agent's own connection and uploads them (relay_pages); the CRM then starts
// the collector, which reads them.

import { prisma } from "./db";

/** Only pages of the sites the collector reads are accepted. */
const HOSTS = /(^|\.)(ss\.ge|binebi\.ge|myhome\.ge|place\.ge|rentals\.ge|korter\.ge)$/;
const CLAIM_MS = 10 * 60_000;
const MAX_HTML = 3_500_000;

export function relayHostAllowed(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && HOSTS.test(u.hostname);
  } catch {
    return false;
  }
}

/** Pages still needed (oldest first), each taken for 10 minutes by the extension that asked. */
export async function claimRelayRequests(limit: number): Promise<string[]> {
  const free = new Date(Date.now() - CLAIM_MS);
  const rows = await prisma.relayRequest.findMany({
    where: { OR: [{ claimedAt: null }, { claimedAt: { lt: free } }] },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { url: true },
  });
  const urls = rows.map((r) => r.url).filter(relayHostAllowed);
  if (urls.length) await prisma.relayRequest.updateMany({ where: { url: { in: urls } }, data: { claimedAt: new Date() } });
  return urls;
}

/** Stored instead of the HTML when the site answers 404/410: the listing was removed. */
export const GONE = "__GONE__";

export async function storeRelayPage(url: string, html: string, gone = false): Promise<{ ok: boolean; error?: string }> {
  if (!relayHostAllowed(url)) return { ok: false, error: "host not allowed" };
  if (gone) html = GONE;
  if (!html || html.length > MAX_HTML) return { ok: false, error: "empty or too large" };
  // A browser check page instead of the listing is not useful.
  if (/<title>\s*Just a moment/i.test(html)) return { ok: false, error: "browser check page" };
  await prisma.relayPage.upsert({ where: { url }, update: { html, fetchedAt: new Date() }, create: { url, html } });
  await prisma.relayRequest.deleteMany({ where: { url } });
  return { ok: true };
}

/** Old copies are of no use (result pages count for an hour, detail pages for two weeks). */
export async function pruneRelayPages(): Promise<void> {
  await prisma.relayPage.deleteMany({ where: { fetchedAt: { lt: new Date(Date.now() - 15 * 86400_000) } } });
}

export async function relayStats() {
  const since = new Date(Date.now() - 24 * 3600_000);
  const [waiting, sentToday] = await Promise.all([prisma.relayRequest.count(), prisma.relayPage.count({ where: { fetchedAt: { gte: since } } })]);
  return { waiting, sentToday };
}
