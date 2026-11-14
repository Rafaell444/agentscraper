import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { daysAgo, fmtDate, fmtMoney, fmtNum } from "@/lib/format";
import { placeName } from "@/lib/catalog";
import { EN_CONDITION, EN_DEAL, EN_TYPE, en } from "@/lib/segments";
import { englishTitle } from "@/lib/browse";
import { filterOptions } from "@/lib/queries";
import { Button, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { Tx } from "@/lib/partnerText";

export const dynamic = "force-dynamic";

// Every listing the collector found, for the partner: English, every filter,
// view only.  Never the owner's number, name or the source link (the source
// page would show the number).

const PAGE = 30;

type Params = Record<string, string | undefined>;

function n(value: string | undefined): number | undefined {
  const v = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return value && Number.isFinite(v) && v > 0 ? v : undefined;
}

/** Condition and building-status values present in the listings (cached briefly). */
const extraOptions = unstable_cache(
  async () => {
    const [conditions, statuses] = await Promise.all([
      prisma.listing.groupBy({ by: ["condition"], where: { archived: false, NOT: { condition: null } }, _count: true }),
      prisma.listing.groupBy({ by: ["status"], where: { archived: false, NOT: { status: null } }, _count: true }),
    ]);
    const top = (rows: { _count: number }[], key: "condition" | "status") =>
      rows
        .filter((r) => r._count >= 5)
        .sort((a, b) => b._count - a._count)
        .map((r) => String((r as unknown as Record<string, string>)[key]))
        .filter(Boolean)
        .slice(0, 20);
    return { conditions: top(conditions, "condition"), statuses: top(statuses, "status") };
  },
  ["browse-extra-options"],
  { revalidate: 600 },
);

export default async function BrowsePage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireMember();
  const p = await searchParams;
  const page = Math.max(1, Number(p.page) || 1);
  const where: Prisma.ListingWhereInput = { archived: false };
  const and: Prisma.ListingWhereInput[] = [];
  if (p.deal) where.dealType = p.deal;
  if (p.type) where.propertyType = p.type;
  if (p.site) where.site = p.site;
  if (p.district) where.district = p.district;
  if (p.neighbourhood) where.neighbourhood = p.neighbourhood;
  if (p.condition) where.condition = p.condition;
  if (p.status) where.status = p.status;
  if (p.who === "owner" || p.who === "agent") where.posterKind = p.who;
  const range = (min?: number, max?: number) => (min || max ? { gte: min, lte: max } : undefined);
  const price = range(n(p.priceMin), n(p.priceMax));
  if (price) where.priceUsd = price;
  const ppm = n(p.ppmMax);
  if (ppm) where.pricePerM2Usd = { lte: ppm };
  const area = range(n(p.areaMin), n(p.areaMax));
  if (area) where.areaM2 = area;
  const floor = range(n(p.floorMin), n(p.floorMax));
  if (floor) where.floor = floor;
  if (p.notFirst === "1") and.push({ OR: [{ floor: null }, { floor: { gt: 1 } }] });
  if (p.notLast === "1") and.push({ NOT: { floor: { equals: prisma.listing.fields.totalFloors } } });
  const total = range(n(p.totalMin), n(p.totalMax));
  if (total) where.totalFloors = total;
  const rooms = n(p.rooms);
  if (rooms) where.rooms = rooms >= 5 ? { gte: 5 } : rooms;
  const bedrooms = n(p.bedrooms);
  if (bedrooms) where.bedrooms = bedrooms >= 4 ? { gte: 4 } : bedrooms;
  const bathrooms = n(p.bathrooms);
  if (bathrooms) where.bathrooms = bathrooms >= 3 ? { gte: 3 } : bathrooms;
  if (p.photos === "1") and.push({ NOT: [{ image: null }, { image: "" }] });
  const days = n(p.days);
  if (days) where.collectedAt = { gte: daysAgo(days) };
  // Search the text only: never the phone or the owner's name.
  if (p.q) and.push({ OR: [{ title: { contains: p.q } }, { address: { contains: p.q } }, { description: { contains: p.q } }, { propertyId: { contains: p.q } }] });
  if (and.length) where.AND = and;
  const orderBy: Prisma.ListingOrderByWithRelationInput[] =
    p.sort === "price_asc" ? [{ priceUsd: "asc" }]
    : p.sort === "price_desc" ? [{ priceUsd: "desc" }]
    : p.sort === "area_desc" ? [{ areaM2: "desc" }]
    : p.sort === "ppm_asc" ? [{ pricePerM2Usd: "asc" }]
    : [{ collectedAt: "desc" }, { id: "desc" }];

  const [count, items, options, extra] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE,
      take: PAGE,
      select: { id: true, image: true, rooms: true, bedrooms: true, bathrooms: true, propertyType: true, dealType: true, condition: true, neighbourhood: true, district: true, priceUsd: true, areaM2: true, floor: true, totalFloors: true, posterKind: true, siteName: true, collectedAt: true },
    }),
    filterOptions(""),
    extraOptions(),
  ]);
  const pages = Math.max(1, Math.ceil(count / PAGE));
  const href = (patch: Params) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...p, ...patch })) if (v) q.set(k, v);
    return `/browse?${q}`;
  };
  const active = Object.entries(p).filter(([k, v]) => v && k !== "page" && k !== "sort").length;

  return (
    <div className="space-y-4">
      <PageHeader
        title={<><Tx p ka="" en="Listings" hi="सभी लिस्टिंग" /> <span className="text-base font-normal text-gray-400">{fmtNum(count)}</span></>}
        subtitle="Every flat our system found on Georgian sites. View only: owners' numbers stay with our team."
      />

      <Card title={<><Tx p ka="" en="Filters" hi="फ़िल्टर" />{active ? <span className="ml-2 text-xs font-normal text-emerald-700">{active} active</span> : null}</>}>
        <form method="get" className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Select name="deal" defaultValue={p.deal ?? ""}>
              <option value="">Any deal</option>
              {options.deals.map((d) => <option key={d} value={d}>{en(EN_DEAL, d)}</option>)}
            </Select>
            <Select name="type" defaultValue={p.type ?? ""}>
              <option value="">Any type</option>
              {options.types.map((t) => <option key={t} value={t}>{en(EN_TYPE, t)}</option>)}
            </Select>
            <Select name="district" defaultValue={p.district ?? ""}>
              <option value="">Any district</option>
              {options.districts.filter((d) => d.name).map((d) => <option key={d.name} value={d.name}>{placeName(d.name, "en")} ({d.count})</option>)}
            </Select>
            <Select name="neighbourhood" defaultValue={p.neighbourhood ?? ""}>
              <option value="">Any neighbourhood</option>
              {(p.district ? options.neighbourhoodsByDistrict[p.district] ?? [] : options.neighbourhoods).map((name) => <option key={name} value={name}>{placeName(name, "en")}</option>)}
            </Select>
            <Select name="site" defaultValue={p.site ?? ""}>
              <option value="">Any website</option>
              {options.sites.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
            <Select name="who" defaultValue={p.who ?? ""}>
              <option value="">Owners and agents</option>
              <option value="owner">Owners only</option>
              <option value="agent">Agents only</option>
            </Select>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Input name="priceMin" defaultValue={p.priceMin ?? ""} placeholder="Price from $" inputMode="numeric" />
            <Input name="priceMax" defaultValue={p.priceMax ?? ""} placeholder="Price to $" inputMode="numeric" />
            <Input name="ppmMax" defaultValue={p.ppmMax ?? ""} placeholder="Max $ per m²" inputMode="numeric" />
            <Input name="areaMin" defaultValue={p.areaMin ?? ""} placeholder="Area from m²" inputMode="numeric" />
            <Input name="areaMax" defaultValue={p.areaMax ?? ""} placeholder="Area to m²" inputMode="numeric" />
            <Select name="days" defaultValue={p.days ?? ""}>
              <option value="">Any time</option>
              <option value="1">Last 24 hours</option>
              <option value="3">Last 3 days</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
            </Select>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Select name="rooms" defaultValue={p.rooms ?? ""}>
              <option value="">Any rooms</option>
              {[1, 2, 3, 4].map((r) => <option key={r} value={r}>{r} room{r > 1 ? "s" : ""}</option>)}
              <option value="5">5+ rooms</option>
            </Select>
            <Select name="bedrooms" defaultValue={p.bedrooms ?? ""}>
              <option value="">Any bedrooms</option>
              {[1, 2, 3].map((r) => <option key={r} value={r}>{r} bedroom{r > 1 ? "s" : ""}</option>)}
              <option value="4">4+ bedrooms</option>
            </Select>
            <Select name="bathrooms" defaultValue={p.bathrooms ?? ""}>
              <option value="">Any bathrooms</option>
              <option value="1">1 bathroom</option>
              <option value="2">2 bathrooms</option>
              <option value="3">3+ bathrooms</option>
            </Select>
            <Input name="floorMin" defaultValue={p.floorMin ?? ""} placeholder="Floor from" inputMode="numeric" />
            <Input name="floorMax" defaultValue={p.floorMax ?? ""} placeholder="Floor to" inputMode="numeric" />
            <Input name="totalMax" defaultValue={p.totalMax ?? ""} placeholder="Building floors up to" inputMode="numeric" />
          </div>

          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Select name="condition" defaultValue={p.condition ?? ""}>
              <option value="">Any condition</option>
              {extra.conditions.map((c) => <option key={c} value={c}>{en(EN_CONDITION, c)}</option>)}
            </Select>
            <Select name="status" defaultValue={p.status ?? ""}>
              <option value="">New or old building</option>
              {extra.statuses.map((s) => <option key={s} value={s}>{en(EN_CONDITION, s)}</option>)}
            </Select>
            <Select name="photos" defaultValue={p.photos ?? ""}>
              <option value="">With or without photos</option>
              <option value="1">With photos only</option>
            </Select>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" name="notFirst" value="1" defaultChecked={p.notFirst === "1"} /> Not ground floor
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" name="notLast" value="1" defaultChecked={p.notLast === "1"} /> Not top floor
            </label>
            <Select name="sort" defaultValue={p.sort ?? ""}>
              <option value="">Newest first</option>
              <option value="price_asc">Cheapest first</option>
              <option value="price_desc">Most expensive first</option>
              <option value="ppm_asc">Cheapest per m²</option>
              <option value="area_desc">Largest first</option>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Input name="q" defaultValue={p.q ?? ""} placeholder="Search text / ID" className="max-w-xs" />
            <Button type="submit">Show</Button>
            <Link href="/browse" className="ui-btn ui-btn-ghost">Reset</Link>
          </div>
        </form>
      </Card>

      {items.length === 0 ? (
        <Card><EmptyState title="Nothing found" hint="Try fewer filters." /></Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((l) => (
            <li key={l.id} className="ui-card overflow-hidden">
              <Link href={`/browse/${encodeURIComponent(l.id)}`} className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {l.image ? <img src={l.image} alt="" className="h-44 w-full object-cover" loading="lazy" referrerPolicy="no-referrer" /> : <div className="h-44 w-full bg-gray-100" />}
                <div className="space-y-1.5 p-3">
                  <div className="font-semibold text-gray-900">{englishTitle(l)}</div>
                  <div className="text-lg font-bold text-gray-900">{fmtMoney(l.priceUsd) || "Price on request"}</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-gray-700">
                    {l.rooms ? <span>🚪 {l.rooms} room{l.rooms > 1 ? "s" : ""}</span> : null}
                    {l.bedrooms ? <span>🛏 {l.bedrooms} bedroom{l.bedrooms > 1 ? "s" : ""}</span> : null}
                    {l.bathrooms ? <span>🛁 {l.bathrooms}</span> : null}
                    {l.areaM2 ? <span>📐 {fmtNum(l.areaM2)} m²</span> : null}
                    {l.floor ? <span>🏢 {l.floor}{l.totalFloors ? `/${l.totalFloors}` : ""}</span> : null}
                  </div>
                  <div className="text-xs text-gray-500">{[en(EN_CONDITION, l.condition), l.posterKind === "agent" ? "Agent" : l.posterKind === "owner" ? "Owner" : "", l.siteName, fmtDate(l.collectedAt)].filter(Boolean).join(" · ")}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-center gap-2 text-sm">
          {page > 1 ? <Link href={href({ page: String(page - 1) })} className="ui-btn ui-btn-secondary ui-btn-sm">← Previous</Link> : null}
          <span className="text-gray-500">Page {page} of {pages}</span>
          {page < pages ? <Link href={href({ page: String(page + 1) })} className="ui-btn ui-btn-secondary ui-btn-sm">Next →</Link> : null}
        </div>
      ) : null}
    </div>
  );
}
