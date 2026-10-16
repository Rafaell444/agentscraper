import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { SEGMENTS, segmentBySlug, segmentWhere } from "@/lib/segments";
import { fmtDate, fmtMoney, fmtNum } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { Card, Chip, EmptyState, LinkButton, PageHeader, PhoneButton, PosterBadge, SiteBadge, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SegmentPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;
  const segment = segmentBySlug(slug);
  if (!segment) notFound();
  const [listings, settings] = await Promise.all([
    prisma.listing.findMany({
      where: segmentWhere(segment),
      include: { lead: { select: { status: true, manualPhone: true, hidden: true } } },
      orderBy: { collectedAt: "desc" },
      take: 200,
    }),
    getSettings(),
  ]);
  const base = settings.public_base_url.replace(/\/$/, "");

  return (
    <div className="space-y-4">
      <PageHeader
        title={segment.title}
        subtitle={`${segment.dealTypes.join(", ")} · ${[...segment.districts, ...segment.neighbourhoods].join(", ")}${segment.maxPriceUsd ? ` · ≤ ${fmtMoney(segment.maxPriceUsd)}` : ""}`}
        actions={
          <>
            {SEGMENTS.map((s) => (
              <Chip key={s.slug} href={`/segments/${s.slug}`} active={s.slug === slug}>{s.title}</Chip>
            ))}
            <LinkButton href={`/p/${slug}`} external>საჯარო გვერდი ↗</LinkButton>
            <LinkButton href={`/segments/${slug}/qr`} variant="primary">QR კოდი (ბეჭდვა)</LinkButton>
          </>
        }
      />
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
        საჯარო გვერდი ინგლისურადაა, მესაკუთრის ნომრის გარეშე, ჩვენი კონტაქტით ({settings.agency_phone || "დააყენეთ პარამეტრებში"}). მისამართი: <code className="rounded bg-gray-100 px-1">{base || "(public_base_url პარამეტრებში)"}/p/{slug}</code>. განცხადება გვერდიდან იმალება მისი გვერდის „დამალე საჯარო გვერდიდან“ ღილაკით.
      </div>
      <Card title={`განცხადებები (${listings.length})`}>
        {listings.length === 0 ? (
          <EmptyState title="ამ სეგმენტში განცხადებები ჯერ არ არის" />
        ) : (
          <ul className="divide-y divide-gray-100">
            {listings.map((listing) => (
              <li key={listing.id} className={`flex flex-wrap items-center gap-2 py-2 sm:flex-nowrap sm:gap-3 ${listing.lead?.hidden ? "opacity-50" : ""}`}>
                {listing.image ? <img src={listing.image} alt="" className="hidden h-14 w-20 shrink-0 rounded-md object-cover sm:block" /> : <div className="hidden h-14 w-20 shrink-0 rounded-md bg-gray-100 sm:block" />}
                <div className="min-w-0 flex-1">
                  <Link href={`/listings/${listing.id}`} className="block truncate text-sm font-medium text-gray-900 hover:text-emerald-700">
                    {listing.title ?? listing.propertyId}
                  </Link>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                    <SiteBadge site={listing.site} name={listing.siteName} />
                    <PosterBadge kind={listing.posterKind} ownerType={listing.ownerType} />
                    <span>{listing.neighbourhood ?? listing.district}</span>
                    <span>{listing.rooms ? `${listing.rooms} ოთ.` : ""} {listing.areaM2 ? `${fmtNum(listing.areaM2)} მ²` : ""}</span>
                    <span className="font-semibold text-gray-800">{fmtMoney(listing.priceUsd)}</span>
                    <span>{fmtDate(listing.collectedAt)}</span>
                    {listing.lead?.hidden ? <span className="text-rose-600">დამალულია</span> : null}
                  </div>
                </div>
                <StatusBadge status={listing.lead?.status} />
                <PhoneButton phone={listing.phone || listing.lead?.manualPhone} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
