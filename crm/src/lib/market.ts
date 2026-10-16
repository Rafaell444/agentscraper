import { prisma } from "./db";
import { daysAgo, median } from "./format";

export type Benchmark = {
  medianPpm: number | null; // $/m² for the same deal, type, place, rooms
  medianPrice: number | null;
  diffPct: number | null; // this listing vs median $/m² (negative = cheaper)
  samples: number;
  scope: string; // description of the comparison group
};

/** Compare a listing with similar active postings of the last 90 days. */
export async function benchmark(listing: {
  dealType: string | null;
  propertyType: string | null;
  neighbourhood: string | null;
  district: string | null;
  rooms: number | null;
  pricePerM2Usd: number | null;
  priceUsd: number | null;
}): Promise<Benchmark | null> {
  if (!listing.dealType || !listing.propertyType) return null;
  const since = daysAgo(90);
  const base = { dealType: listing.dealType, propertyType: listing.propertyType, collectedAt: { gte: since }, NOT: { pricePerM2Usd: null } };
  const tries: { where: Record<string, unknown>; scope: string }[] = [];
  if (listing.neighbourhood && listing.rooms) tries.push({ where: { ...base, neighbourhood: listing.neighbourhood, rooms: listing.rooms }, scope: `${listing.rooms} ოთ. · ${listing.neighbourhood}` });
  if (listing.neighbourhood) tries.push({ where: { ...base, neighbourhood: listing.neighbourhood }, scope: listing.neighbourhood });
  if (listing.district) tries.push({ where: { ...base, district: listing.district }, scope: listing.district });
  for (const attempt of tries) {
    const rows = await prisma.listing.findMany({ where: attempt.where, select: { pricePerM2Usd: true, priceUsd: true }, take: 500 });
    const ppm = rows.map((r) => r.pricePerM2Usd).filter((v): v is number => v != null && v > 50);
    if (ppm.length >= 5) {
      const med = median(ppm) ?? null;
      const prices = rows.map((r) => r.priceUsd).filter((v): v is number => v != null && v > 0);
      return {
        medianPpm: med,
        medianPrice: median(prices) ?? null,
        diffPct: med && listing.pricePerM2Usd ? Math.round(((listing.pricePerM2Usd - med) / med) * 100) : null,
        samples: ppm.length,
        scope: attempt.scope,
      };
    }
  }
  return null;
}

export type AreaStats = {
  name: string;
  district: string | null;
  saleMedianPpm: number | null;
  saleCount: number;
  rentMedian: number | null;
  rentCount: number;
  ownerNew7: number;
  ownerNew30: number;
  avgDaysOnMarket: number | null;
  active: number;
};

/** Per-neighbourhood market table for the last 90 days (apartments). */
export async function areaStats(level: "neighbourhood" | "district"): Promise<AreaStats[]> {
  const since = daysAgo(90);
  const rows = await prisma.listing.findMany({
    where: { collectedAt: { gte: since }, propertyType: "ბინა", city: { contains: "თბილისი" } },
    select: { neighbourhood: true, district: true, dealType: true, priceUsd: true, pricePerM2Usd: true, posterKind: true, collectedAt: true, postedAt: true, archived: true, lastSyncAt: true },
  });
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = (level === "neighbourhood" ? row.neighbourhood || row.district : row.district) || "—";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(row);
  }
  const d7 = daysAgo(7);
  const d30 = daysAgo(30);
  const result: AreaStats[] = [];
  for (const [name, items] of groups) {
    const sale = items.filter((r) => r.dealType === "იყიდება" && r.pricePerM2Usd && r.pricePerM2Usd > 50).map((r) => r.pricePerM2Usd!);
    const rent = items.filter((r) => r.dealType === "ქირავდება" && r.priceUsd && r.priceUsd > 50).map((r) => r.priceUsd!);
    const days = items
      .map((r) => {
        const start = r.postedAt ?? r.collectedAt;
        const end = r.archived ? r.lastSyncAt : new Date();
        return start && end ? (end.getTime() - start.getTime()) / 86_400_000 : null;
      })
      .filter((v): v is number => v != null && v >= 0 && v < 365);
    result.push({
      name,
      district: items[0]?.district ?? null,
      saleMedianPpm: median(sale) ? Math.round(median(sale)!) : null,
      saleCount: sale.length,
      rentMedian: median(rent) ? Math.round(median(rent)!) : null,
      rentCount: rent.length,
      ownerNew7: items.filter((r) => r.posterKind === "owner" && r.collectedAt && r.collectedAt >= d7).length,
      ownerNew30: items.filter((r) => r.posterKind === "owner" && r.collectedAt && r.collectedAt >= d30).length,
      avgDaysOnMarket: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null,
      active: items.filter((r) => !r.archived).length,
    });
  }
  return result.sort((a, b) => b.active - a.active);
}
