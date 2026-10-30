// Numbers for the "📊 სტატისტიკა" tab: what each flat got in the mini app and
// which channel brought the people who asked about it.

import { prisma } from "./db";

export type ListingStats = { postId: string; views: number; saves: number; shares: number; clicks: number; leads: number };
export type SourceStats = { source: string; opens: number; flatClicks: number; views: number; leads: number; top: { postId: string; clicks: number }[] };

/** Tbilisi day ("2026-10-30") for the daily chart. */
function day(date: Date): string {
  return new Date(date.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
}

export async function catalogStats(days: number) {
  const since = new Date(Date.now() - days * 86400_000);
  const [grouped, leadsByPost, leadsBySource, daily, leadDaily] = await Promise.all([
    prisma.catalogEvent.groupBy({ by: ["postId", "kind", "source"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.catalogLead.groupBy({ by: ["postId"], where: { createdAt: { gte: since }, postId: { not: null } }, _count: { _all: true } }),
    prisma.catalogLead.groupBy({ by: ["source"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.catalogEvent.findMany({ where: { createdAt: { gte: since }, kind: { in: ["open", "view"] } }, select: { kind: true, createdAt: true } }),
    prisma.catalogLead.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
  ]);

  // Per listing.
  const listings = new Map<string, ListingStats>();
  const row = (postId: string) => {
    let r = listings.get(postId);
    if (!r) listings.set(postId, (r = { postId, views: 0, saves: 0, shares: 0, clicks: 0, leads: 0 }));
    return r;
  };
  for (const g of grouped) {
    if (!g.postId) continue;
    const r = row(g.postId);
    const n = g._count._all;
    if (g.kind === "view") r.views += n;
    if (g.kind === "save") r.saves += n;
    if (g.kind === "share") r.shares += n;
    // An "open" with a flat is a tap on that flat's link (channel post, alert, a friend's share).
    if (g.kind === "open" && g.source.startsWith("channel_")) r.clicks += n;
  }
  for (const l of leadsByPost) if (l.postId) row(l.postId).leads += l._count._all;

  // Per source (channel).
  const sources = new Map<string, SourceStats & { byPost: Map<string, number> }>();
  const src = (source: string) => {
    let s = sources.get(source);
    if (!s) sources.set(source, (s = { source, opens: 0, flatClicks: 0, views: 0, leads: 0, top: [], byPost: new Map() }));
    return s;
  };
  for (const g of grouped) {
    const s = src(g.source);
    const n = g._count._all;
    if (g.kind === "open") {
      s.opens += n;
      if (g.postId) {
        s.flatClicks += n;
        s.byPost.set(g.postId, (s.byPost.get(g.postId) ?? 0) + n);
      }
    }
    if (g.kind === "view") s.views += n;
  }
  for (const l of leadsBySource) src(l.source ?? "unknown").leads += l._count._all;
  const sourceList: SourceStats[] = [...sources.values()]
    .map(({ byPost, ...s }) => ({ ...s, top: [...byPost].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([postId, clicks]) => ({ postId, clicks })) }))
    .sort((a, b) => b.leads - a.leads || b.opens - a.opens);

  // Daily chart: visits and requests.
  const chart = new Map<string, { day: string; ნახვა: number; მოთხოვნა: number }>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = day(new Date(Date.now() - i * 86400_000));
    chart.set(d, { day: d.slice(5), ნახვა: 0, მოთხოვნა: 0 });
  }
  for (const e of daily) if (e.kind === "view") { const c = chart.get(day(e.createdAt)); if (c) c.ნახვა += 1; }
  for (const l of leadDaily) { const c = chart.get(day(l.createdAt)); if (c) c.მოთხოვნა += 1; }

  const totals = { opens: 0, views: 0, saves: 0, shares: 0, leads: leadDaily.length };
  for (const g of grouped) {
    if (g.kind === "open") totals.opens += g._count._all;
    if (g.kind === "view") totals.views += g._count._all;
    if (g.kind === "save") totals.saves += g._count._all;
    if (g.kind === "share") totals.shares += g._count._all;
  }

  const ids = [...new Set([...listings.keys(), ...sourceList.flatMap((s) => s.top.map((t) => t.postId))])];
  const posts = await prisma.sharedPost.findMany({
    where: { id: { in: ids } },
    select: { id: true, refNo: true, propertyType: true, rooms: true, district: true, location: true, price: true, currency: true, dealType: true, availability: true, channelPostedAt: true },
  });

  return {
    totals,
    listings: [...listings.values()].sort((a, b) => b.leads - a.leads || b.views - a.views),
    sources: sourceList,
    chart: [...chart.values()],
    posts: new Map(posts.map((p) => [p.id, p])),
  };
}
