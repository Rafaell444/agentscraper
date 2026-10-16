import type { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { PAGE_SIZE } from "./options";
import { daysAgo } from "./format";

export type SearchParams = Record<string, string | string[] | undefined>;

export function param(params: SearchParams, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function num(value: string): number | undefined {
  const parsed = Number(value);
  return value !== "" && Number.isFinite(parsed) ? parsed : undefined;
}

export type ListingFilters = {
  q: string;
  site: string;
  deal: string;
  type: string;
  district: string;
  neighbourhood: string;
  priceMin: string;
  priceMax: string;
  areaMin: string;
  areaMax: string;
  rooms: string;
  status: string;
  assigned: string;
  phone: string;
  days: string;
  archived: string;
  sort: string;
  page: string;
  who: string; // owner | agent | all
  key: string; // property key: every posting of one property
  reposted: string; // "1" = only ads our agents re-posted under their own profile
};

export const POSTER_KINDS = [
  { value: "owner", label: "მესაკუთრე" },
  { value: "agent", label: "აგენტი" },
  { value: "all", label: "ყველა" },
];

export function readFilters(params: SearchParams): ListingFilters {
  return {
    q: param(params, "q"),
    site: param(params, "site"),
    deal: param(params, "deal"),
    type: param(params, "type"),
    district: param(params, "district"),
    neighbourhood: param(params, "neighbourhood"),
    priceMin: param(params, "priceMin"),
    priceMax: param(params, "priceMax"),
    areaMin: param(params, "areaMin"),
    areaMax: param(params, "areaMax"),
    rooms: param(params, "rooms"),
    status: param(params, "status"),
    assigned: param(params, "assigned"),
    phone: param(params, "phone"),
    days: param(params, "days"),
    archived: param(params, "archived"),
    sort: param(params, "sort") || "newest",
    page: param(params, "page") || "1",
    who: param(params, "who") || "owner",
    key: param(params, "key"),
    reposted: param(params, "reposted"),
  };
}

export function buildWhere(filters: ListingFilters): Prisma.ListingWhereInput {
  const where: Prisma.ListingWhereInput = {};
  const and: Prisma.ListingWhereInput[] = [];
  if (filters.archived !== "1") where.archived = false;
  if (filters.who === "owner" || filters.who === "agent") where.posterKind = filters.who;
  if (filters.key) where.propertyKey = filters.key;
  if (filters.reposted === "1") where.lead = { ...(where.lead as Prisma.LeadWhereInput | undefined), repostedId: { not: null } };
  if (filters.site) where.site = filters.site;
  if (filters.deal) where.dealType = filters.deal;
  if (filters.type) where.propertyType = filters.type;
  if (filters.district) where.district = filters.district;
  if (filters.neighbourhood) where.neighbourhood = filters.neighbourhood;
  if (filters.phone === "1") and.push({ OR: [{ AND: [{ NOT: { phone: null } }, { NOT: { phone: "" } }] }, { lead: { manualPhone: { not: null } } }] });
  else if (filters.phone === "0") and.push({ OR: [{ phone: null }, { phone: "" }] }, { OR: [{ lead: null }, { lead: { manualPhone: null } }] });
  else if (filters.phone) where.phone = { contains: filters.phone };
  const priceMin = num(filters.priceMin);
  const priceMax = num(filters.priceMax);
  if (priceMin !== undefined || priceMax !== undefined) where.priceUsd = { gte: priceMin, lte: priceMax };
  const areaMin = num(filters.areaMin);
  const areaMax = num(filters.areaMax);
  if (areaMin !== undefined || areaMax !== undefined) where.areaM2 = { gte: areaMin, lte: areaMax };
  const rooms = num(filters.rooms);
  if (rooms !== undefined) where.rooms = rooms >= 5 ? { gte: 5 } : rooms;
  const days = num(filters.days);
  if (days !== undefined && days > 0) where.collectedAt = { gte: daysAgo(days) };
  if (filters.q) {
    and.push({
      OR: [
        { title: { contains: filters.q } },
        { address: { contains: filters.q } },
        { description: { contains: filters.q } },
        { ownerName: { contains: filters.q } },
        { propertyId: { contains: filters.q } },
        { phone: { contains: filters.q } },
        { lead: { repostedId: { contains: filters.q } } },
        { lead: { manualPhone: { contains: filters.q } } },
      ],
    });
  }
  if (filters.status) {
    if (filters.status === "new") and.push({ OR: [{ lead: null }, { lead: { status: "new" } }] });
    else where.lead = { status: filters.status };
  }
  if (filters.assigned) {
    if (filters.assigned === "none") and.push({ OR: [{ lead: null }, { lead: { assignedToId: null } }] });
    else where.lead = { ...(where.lead as Prisma.LeadWhereInput | undefined), assignedToId: filters.assigned };
  }
  if (and.length) where.AND = and;
  return where;
}

export function buildOrder(sort: string): Prisma.ListingOrderByWithRelationInput[] {
  switch (sort) {
    case "price_asc":
      return [{ priceUsd: "asc" }];
    case "price_desc":
      return [{ priceUsd: "desc" }];
    case "ppm_asc":
      return [{ pricePerM2Usd: "asc" }];
    case "area_desc":
      return [{ areaM2: "desc" }];
    case "oldest":
      return [{ collectedAt: "asc" }];
    default:
      return [{ collectedAt: "desc" }, { id: "desc" }];
  }
}

export async function listListings(filters: ListingFilters) {
  const where = buildWhere(filters);
  const page = Math.max(1, Number(filters.page) || 1);
  const [total, items] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      orderBy: buildOrder(filters.sort),
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { lead: { include: { assignedTo: { select: { id: true, name: true } }, repostedBy: { select: { name: true } } } } },
    }),
  ]);
  // How many postings share each listed property, and a phone from another
  // posting of the same property when this one has none.
  const keys = Array.from(new Set(items.map((item) => item.propertyKey).filter((key): key is string => Boolean(key))));
  const [copies, phoned] = keys.length
    ? await Promise.all([
        prisma.listing.groupBy({ by: ["propertyKey"], where: { propertyKey: { in: keys } }, _count: true }),
        prisma.listing.findMany({ where: { propertyKey: { in: keys }, NOT: [{ phone: null }, { phone: "" }] }, select: { propertyKey: true, phone: true, siteName: true, id: true } }),
      ])
    : [[], []];
  const copyCounts: Record<string, number> = {};
  for (const row of copies) if (row.propertyKey) copyCounts[row.propertyKey] = row._count;
  const linkedPhones: Record<string, { phone: string; siteName: string; id: string }> = {};
  for (const row of phoned) if (row.propertyKey && row.phone && !linkedPhones[row.propertyKey]) linkedPhones[row.propertyKey] = { phone: row.phone, siteName: row.siteName, id: row.id };
  return { total, items, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), copyCounts, linkedPhones };
}

// Filter option lists change only when the collector runs (every 30 min), so
// cache them briefly instead of running five GROUP BYs on every page view.
export const filterOptions = unstable_cache(filterOptionsUncached, ["filter-options"], { revalidate: 300 });

async function filterOptionsUncached(who = "") {
  const kind: Prisma.ListingWhereInput = who === "owner" || who === "agent" ? { posterKind: who } : {};
  const [sites, deals, types, areas, users] = await Promise.all([
    prisma.listing.groupBy({ by: ["site", "siteName"], where: { archived: false, ...kind }, _count: true, orderBy: { site: "asc" } }),
    prisma.listing.groupBy({ by: ["dealType"], where: { NOT: { dealType: null } }, _count: true }),
    prisma.listing.groupBy({ by: ["propertyType"], where: { NOT: { propertyType: null } }, _count: true }),
    prisma.listing.groupBy({ by: ["district", "neighbourhood"], where: { archived: false, ...kind }, _count: true }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const sortKa = (values: Iterable<string>) => Array.from(new Set(values)).filter(Boolean).sort((a, b) => a.localeCompare(b, "ka"));
  const names = (rows: { [k: string]: unknown }[], key: string) => sortKa(rows.map((row) => String(row[key] ?? "")));
  const neighbourhoodsByDistrict: Record<string, string[]> = {};
  const districtCounts: Record<string, number> = {};
  for (const row of areas) {
    const district = row.district ?? "";
    districtCounts[district] = (districtCounts[district] ?? 0) + row._count;
    if (row.neighbourhood) (neighbourhoodsByDistrict[district] ??= []).push(row.neighbourhood);
  }
  for (const key of Object.keys(neighbourhoodsByDistrict)) neighbourhoodsByDistrict[key] = sortKa(neighbourhoodsByDistrict[key]);
  return {
    sites: sites.map((row) => ({ value: row.site, label: row.siteName, count: row._count })),
    deals: names(deals, "dealType"),
    types: names(types, "propertyType"),
    districts: sortKa(Object.keys(districtCounts)).map((name) => ({ name, count: districtCounts[name] })),
    neighbourhoods: sortKa(Object.values(neighbourhoodsByDistrict).flat()),
    neighbourhoodsByDistrict,
    users,
  };
}

export type FilterOptions = Awaited<ReturnType<typeof filterOptionsUncached>>;
