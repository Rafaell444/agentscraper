import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { daysAgo, fmtDate, fmtMoney, fmtNum } from "@/lib/format";
import { placeName } from "@/lib/catalog";
import { EN_DEAL, EN_TYPE, en } from "@/lib/segments";
import { englishTitle } from "@/lib/browse";
import { filterOptions } from "@/lib/queries";
import { Button, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { Tx } from "@/lib/partnerText";
import { createMyPostFromListing } from "@/app/share/actions";

export const dynamic = "force-dynamic";

// Every listing the collector found, for the partner: English, his own
// filters, and never the owner's number, name or the source link (the
// source page would show the number).

const PAGE = 30;

type Params = Record<string, string | undefined>;

function n(value: string | undefined): number | undefined {
  const v = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return value && Number.isFinite(v) && v > 0 ? v : undefined;
}

export default async function BrowsePage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireMember();
  const p = await searchParams;
  // Every listing by default (rent, daily and sale); the filters narrow it down.
  const deal = p.deal ?? "";
  const page = Math.max(1, Number(p.page) || 1);
  const where: Prisma.ListingWhereInput = { archived: false };
  const and: Prisma.ListingWhereInput[] = [];
  if (deal) where.dealType = deal;
  if (p.type) where.propertyType = p.type;
  if (p.district) where.district = p.district;
  if (p.neighbourhood) where.neighbourhood = p.neighbourhood;
  if (p.who === "owner" || p.who === "agent") where.posterKind = p.who;
  const priceMin = n(p.priceMin);
  const priceMax = n(p.priceMax);
  if (priceMin || priceMax) where.priceUsd = { gte: priceMin, lte: priceMax };
  const areaMin = n(p.areaMin);
  const areaMax = n(p.areaMax);
  if (areaMin || areaMax) where.areaM2 = { gte: areaMin, lte: areaMax };
  if (p.photos === "1") where.NOT = [{ image: null }, { image: "" }];
  const rooms = n(p.rooms);
  if (rooms) where.rooms = rooms >= 5 ? { gte: 5 } : rooms;
  const days = n(p.days);
  if (days) where.collectedAt = { gte: daysAgo(days) };
  // Search the text only: never the phone or the owner's name.
  if (p.q) and.push({ OR: [{ title: { contains: p.q } }, { address: { contains: p.q } }, { description: { contains: p.q } }, { propertyId: { contains: p.q } }] });
  if (and.length) where.AND = and;
  const orderBy: Prisma.ListingOrderByWithRelationInput[] =
    p.sort === "price_asc" ? [{ priceUsd: "asc" }] : p.sort === "price_desc" ? [{ priceUsd: "desc" }] : [{ collectedAt: "desc" }, { id: "desc" }];

  const [total, items, options] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE,
      take: PAGE,
      select: { id: true, image: true, rooms: true, propertyType: true, dealType: true, neighbourhood: true, district: true, priceUsd: true, areaM2: true, floor: true, totalFloors: true, posterKind: true, siteName: true, collectedAt: true },
    }),
    filterOptions(""),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (extra: Params) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...p, ...extra })) if (v) q.set(k, v);
    return `/browse?${q}`;
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={<><Tx p ka="" en="Listings" hi="सभी लिस्टिंग" /> <span className="text-base font-normal text-gray-400">{fmtNum(total)}</span></>}
        subtitle="Every flat our system found on Georgian sites. Owners' numbers are with our team: to make a WhatsApp post, press “Make my post”."
      />

      <Card title={<Tx p ka="" en="Filters" hi="फ़िल्टर" />}>
        <form method="get" className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Select name="deal" defaultValue={deal}>
            <option value="">Any deal</option>
            {options.deals.map((d) => <option key={d} value={d}>{en(EN_DEAL, d)}</option>)}
          </Select>
          <Select name="type" defaultValue={p.type ?? ""}>
            <option value="">Any type</option>
            {options.types.map((t) => <option key={t} value={t}>{en(EN_TYPE, t)}</option>)}
          </Select>
          <Select name="district" defaultValue={p.district ?? ""} title="Pick a district and press Show to choose a neighbourhood">
            <option value="">Any district</option>
            {options.districts.filter((d) => d.name).map((d) => <option key={d.name} value={d.name}>{placeName(d.name, "en")} ({d.count})</option>)}
          </Select>
          <Input name="priceMin" defaultValue={p.priceMin ?? ""} placeholder="Price from $" inputMode="numeric" />
          <Input name="priceMax" defaultValue={p.priceMax ?? ""} placeholder="Price to $" inputMode="numeric" />
          <Select name="rooms" defaultValue={p.rooms ?? ""}>
            <option value="">Any rooms</option>
            {[1, 2, 3, 4].map((r) => <option key={r} value={r}>{r} room{r > 1 ? "s" : ""}</option>)}
            <option value="5">5+ rooms</option>
          </Select>
          {p.district && options.neighbourhoodsByDistrict[p.district]?.length ? (
            <Select name="neighbourhood" defaultValue={p.neighbourhood ?? ""}>
              <option value="">Any neighbourhood</option>
              {options.neighbourhoodsByDistrict[p.district].map((name) => <option key={name} value={name}>{placeName(name, "en")}</option>)}
            </Select>
          ) : null}
          <Input name="areaMin" defaultValue={p.areaMin ?? ""} placeholder="Area from m²" inputMode="numeric" />
          <Input name="areaMax" defaultValue={p.areaMax ?? ""} placeholder="Area to m²" inputMode="numeric" />
          <Select name="photos" defaultValue={p.photos ?? ""}>
            <option value="">With or without photos</option>
            <option value="1">With photos only</option>
          </Select>
          <Select name="who" defaultValue={p.who ?? ""}>
            <option value="">Owners and agents</option>
            <option value="owner">Owners only</option>
            <option value="agent">Agents only</option>
          </Select>
          <Select name="days" defaultValue={p.days ?? ""}>
            <option value="">Any time</option>
            <option value="1">Last 24 hours</option>
            <option value="3">Last 3 days</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </Select>
          <Select name="sort" defaultValue={p.sort ?? ""}>
            <option value="">Newest first</option>
            <option value="price_asc">Cheapest first</option>
            <option value="price_desc">Most expensive first</option>
          </Select>
          <Input name="q" defaultValue={p.q ?? ""} placeholder="Search text / ID" />
          <div className="flex gap-2">
            <Button type="submit" className="flex-1">Show</Button>
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
              <Link href={`/browse/${encodeURIComponent(l.id)}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {l.image ? <img src={l.image} alt="" className="h-40 w-full object-cover" loading="lazy" referrerPolicy="no-referrer" /> : <div className="h-40 w-full bg-gray-100" />}
              </Link>
              <div className="space-y-1.5 p-3">
                <Link href={`/browse/${encodeURIComponent(l.id)}`} className="block font-semibold text-gray-900 hover:text-emerald-700">{englishTitle(l)}</Link>
                <div className="flex flex-wrap gap-x-3 text-sm text-gray-700">
                  <span className="font-semibold">{fmtMoney(l.priceUsd) || "Price on request"}</span>
                  {l.areaM2 ? <span>{fmtNum(l.areaM2)} m²</span> : null}
                  {l.floor ? <span>Floor {l.floor}{l.totalFloors ? `/${l.totalFloors}` : ""}</span> : null}
                </div>
                <div className="text-xs text-gray-500">{l.posterKind === "agent" ? "Agent" : "Owner"} · {l.siteName} · {fmtDate(l.collectedAt)}</div>
                <form action={createMyPostFromListing}>
                  <input type="hidden" name="listingId" value={l.id} />
                  <Button type="submit" size="sm" variant="secondary">⭐ Make my post</Button>
                </form>
              </div>
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
