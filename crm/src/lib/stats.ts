import { prisma } from "./db";
import { STATUSES } from "./options";
import { dayKey, daysAgo, endOfToday, median } from "./format";

export type DashboardStats = Awaited<ReturnType<typeof dashboardStats>>;

export async function dashboardStats(who = "owner") {
  const kind = who === "owner" || who === "agent" ? { posterKind: who } : {};
  const since30 = daysAgo(30);
  const since7 = daysAgo(7);
  const today = daysAgo(0);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [recent, leads, activities, users, totalActive, withPhone, overdueFollowUps, todayFollowUps, latest] =
    await Promise.all([
      prisma.listing.findMany({
        where: { archived: false, collectedAt: { gte: since30 }, ...kind },
        select: {
          site: true,
          siteName: true,
          collectedAt: true,
          district: true,
          neighbourhood: true,
          dealType: true,
          propertyType: true,
          pricePerM2Usd: true,
          priceUsd: true,
          rooms: true,
          phone: true,
        },
      }),
      prisma.lead.findMany({ where: { listing: kind }, select: { status: true, assignedToId: true, updatedAt: true, createdAt: true } }),
      prisma.activity.findMany({
        where: { createdAt: { gte: since7 } },
        select: { userId: true, type: true, createdAt: true },
      }),
      prisma.user.findMany({ where: { active: true }, select: { id: true, name: true } }),
      prisma.listing.count({ where: { archived: false, ...kind } }),
      prisma.listing.count({ where: { archived: false, NOT: [{ phone: null }, { phone: "" }], ...kind } }),
      prisma.lead.findMany({
        where: { followUpAt: { lt: today }, status: { notIn: ["signed", "rejected", "irrelevant"] } },
        include: { listing: { select: { id: true, title: true, phone: true } }, assignedTo: { select: { name: true } } },
        orderBy: { followUpAt: "asc" },
        take: 10,
      }),
      prisma.lead.count({ where: { followUpAt: { gte: today, lte: endOfToday() } } }),
      prisma.listing.findMany({
        where: { archived: false, ...kind },
        orderBy: { collectedAt: "desc" },
        take: 8,
        include: { lead: { select: { status: true } } },
      }),
    ]);
  const copies = await prisma.listing.groupBy({
    by: ["propertyKey"],
    where: { archived: false, collectedAt: { gte: since30 }, NOT: { propertyKey: null } },
    _count: true,
  });
  const multiPosted = copies.filter((row) => row._count > 1).length;

  // New listings per day for the last 30 days, split by site.
  const days: string[] = [];
  for (let i = 29; i >= 0; i -= 1) days.push(dayKey(daysAgo(i)));
  const siteNames = Array.from(new Set(recent.map((r) => r.site)));
  const perDayMap = new Map(days.map((d) => [d, { day: d.slice(5) } as Record<string, string | number>]));
  for (const site of siteNames) for (const row of perDayMap.values()) row[site] = 0;
  for (const row of recent) {
    if (!row.collectedAt) continue;
    const key = dayKey(row.collectedAt);
    const bucket = perDayMap.get(key);
    if (bucket) bucket[row.site] = Number(bucket[row.site] ?? 0) + 1;
  }
  const perDay = Array.from(perDayMap.values());

  const countBy = (pick: (r: (typeof recent)[number]) => string | null | undefined, limit = 12) => {
    const map = new Map<string, number>();
    for (const row of recent) {
      const key = pick(row) || "—";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
  };

  const byDistrict = countBy((r) => r.district);
  const byNeighbourhood = countBy((r) => r.neighbourhood, 15);
  const byDeal = countBy((r) => r.dealType);
  const byType = countBy((r) => r.propertyType);
  const byRooms = countBy((r) => (r.rooms == null ? null : r.rooms >= 5 ? "5+" : String(r.rooms)), 6).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  // Median asking price per m² for apartments for sale, by district.
  const ppmByDistrict = new Map<string, number[]>();
  const priceByRooms = new Map<string, number[]>();
  for (const row of recent) {
    if (row.dealType !== "იყიდება" || row.propertyType !== "ბინა") continue;
    if (row.pricePerM2Usd && row.pricePerM2Usd > 100 && row.district) {
      const list = ppmByDistrict.get(row.district) ?? [];
      list.push(row.pricePerM2Usd);
      ppmByDistrict.set(row.district, list);
    }
    if (row.priceUsd && row.priceUsd > 1000 && row.rooms != null) {
      const key = row.rooms >= 5 ? "5+" : String(row.rooms);
      const list = priceByRooms.get(key) ?? [];
      list.push(row.priceUsd);
      priceByRooms.set(key, list);
    }
  }
  const medianPpm = Array.from(ppmByDistrict.entries())
    .map(([name, values]) => ({ name, value: Math.round(median(values) ?? 0), count: values.length }))
    .filter((row) => row.count >= 3)
    .sort((a, b) => b.value - a.value);
  const medianPriceByRooms = Array.from(priceByRooms.entries())
    .map(([name, values]) => ({ name, value: Math.round(median(values) ?? 0), count: values.length }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Funnel: listings without a lead are "new".
  const leadCounts = new Map<string, number>();
  for (const lead of leads) leadCounts.set(lead.status, (leadCounts.get(lead.status) ?? 0) + 1);
  const leadsTotal = leads.length;
  const funnel = STATUSES.map((status) => ({
    name: status.label,
    value: status.value === "new" ? totalActive - leadsTotal + (leadCounts.get("new") ?? 0) : leadCounts.get(status.value) ?? 0,
  }));

  // Agent activity over the last 7 days.
  const agentMap = new Map(users.map((u) => [u.id, { name: u.name, notes: 0, calls: 0, statusChanges: 0, assigned: 0 }]));
  for (const activity of activities) {
    const agent = agentMap.get(activity.userId);
    if (!agent) continue;
    if (activity.type === "note") agent.notes += 1;
    else if (activity.type === "call") agent.calls += 1;
    else if (activity.type === "status") agent.statusChanges += 1;
  }
  for (const lead of leads) {
    if (lead.assignedToId && agentMap.has(lead.assignedToId)) agentMap.get(lead.assignedToId)!.assigned += 1;
  }
  const agents = Array.from(agentMap.values()).sort((a, b) => b.notes + b.calls + b.statusChanges - (a.notes + a.calls + a.statusChanges));

  const newToday = recent.filter((r) => r.collectedAt && r.collectedAt >= today).length;
  const new7 = recent.filter((r) => r.collectedAt && r.collectedAt >= since7).length;
  const signedThisMonth = leads.filter((l) => l.status === "signed" && l.updatedAt >= monthStart).length;
  const interested = leads.filter((l) => ["interested", "meeting"].includes(l.status)).length;
  const uniquePhones = new Set(recent.map((r) => (r.phone ?? "").split(";")[0].trim()).filter(Boolean)).size;

  return {
    kpis: {
      totalActive,
      newToday,
      new7,
      new30: recent.length,
      withPhone,
      phonePct: totalActive ? Math.round((withPhone / totalActive) * 100) : 0,
      uniquePhones,
      interested,
      signedThisMonth,
      todayFollowUps,
      overdue: overdueFollowUps.length,
      multiPosted,
    },
    who,
    perDay,
    siteNames,
    byDistrict,
    byNeighbourhood,
    byDeal,
    byType,
    byRooms,
    medianPpm,
    medianPriceByRooms,
    funnel,
    agents,
    overdueFollowUps,
    latest,
  };
}
