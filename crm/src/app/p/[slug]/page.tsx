import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { EN_CONDITION, EN_DEAL, EN_PLACE, EN_TYPE, PUBLIC_TEXT, RU_CONDITION, RU_DEAL, RU_PLACE, RU_TYPE, en, segmentBySlug, segmentWhere } from "@/lib/segments";
import { getSettings } from "@/lib/settings";
import { fmtMoney, fmtNum } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const segment = segmentBySlug(slug);
  return { title: segment?.titleEn ?? "Rentals", robots: { index: false, follow: false } };
}

export default async function PublicSegmentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const segment = segmentBySlug(slug);
  if (!segment) notFound();
  const t = PUBLIC_TEXT[segment.lang];
  const maps = segment.lang === "ru" ? { deal: RU_DEAL, type: RU_TYPE, place: RU_PLACE, cond: RU_CONDITION } : { deal: EN_DEAL, type: EN_TYPE, place: EN_PLACE, cond: EN_CONDITION };
  const [listings, settings] = await Promise.all([
    prisma.listing.findMany({ where: segmentWhere(segment), orderBy: { collectedAt: "desc" }, take: 120 }),
    getSettings(),
  ]);
  const whatsapp = settings.agency_whatsapp.replace(/^\+/, "");
  const waLink = (ref: string) => (whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`${t.interested} ${ref}`)}` : "");
  const daysAgo = (date: Date | null) => {
    if (!date) return "";
    const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
    return days <= 0 ? t.today : days === 1 ? t.yesterday : `${days} ${t.daysAgo}`;
  };
  const perUnit = segment.dealTypes.includes("ქირავდება დღიურად") ? t.day : segment.dealTypes.includes("იყიდება") ? "" : t.month;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-5 rounded-2xl bg-emerald-700 px-5 py-6 text-white shadow-md">
        <div className="text-xs uppercase tracking-wide text-emerald-200">{settings.agency_name || t.agency}</div>
        <h1 className="mt-1 text-2xl font-bold">{segment.titleEn}</h1>
        <p className="mt-2 max-w-2xl text-sm text-emerald-50">{(slug === "indian" && settings.public_intro_en) || segment.descriptionEn}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {settings.agency_phone ? (
            <a href={`tel:${settings.agency_phone.replace(/\s/g, "")}`} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-emerald-800">📞 {settings.agency_phone}</a>
          ) : null}
          {whatsapp ? <a href={waLink("")} className="rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white">{t.wa}</a> : null}
        </div>
      </header>

      <p className="mb-3 text-sm text-gray-500">{listings.length} {t.listings} · {t.updated}</p>

      {listings.length === 0 ? (
        <div className="ui-card p-8 text-center text-gray-500">{t.none}</div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => {
            const ref = `#${listing.site.toUpperCase().slice(0, 2)}-${listing.propertyId}`;
            return (
              <li key={listing.id} className="ui-card overflow-hidden">
                <Link href={`/p/l/${listing.id}?lang=${segment.lang}`}>
                  {listing.image ? <img src={listing.image} alt="" className="h-44 w-full object-cover" /> : <div className="h-44 w-full bg-gray-100" />}
                </Link>
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-lg font-bold text-emerald-700">
                      {fmtMoney(listing.priceUsd) || fmtMoney(listing.priceGel, "₾")}
                      {perUnit ? <span className="text-xs font-normal text-gray-500"> {perUnit}</span> : null}
                    </div>
                    <span className="text-[11px] text-gray-400">{daysAgo(listing.collectedAt)}</span>
                  </div>
                  <Link href={`/p/l/${listing.id}?lang=${segment.lang}`} className="block text-sm font-medium text-gray-900 hover:text-emerald-700">
                    {en(maps.deal, listing.dealType)} · {en(maps.type, listing.propertyType)}{listing.rooms ? ` · ${listing.rooms} ${t.rooms}` : ""}
                  </Link>
                  <div className="text-sm text-gray-600">
                    {en(maps.place, listing.neighbourhood) || en(maps.place, listing.district)}{listing.district && listing.neighbourhood ? `, ${en(maps.place, listing.district)}` : ""}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500">
                    {listing.areaM2 ? <span>{fmtNum(listing.areaM2)} m²</span> : null}
                    {listing.floor != null ? <span>{t.floor} {listing.floor}{listing.totalFloors ? `/${listing.totalFloors}` : ""}</span> : null}
                    {listing.bedrooms ? <span>{listing.bedrooms} {t.bedrooms}</span> : null}
                    {listing.condition ? <span>{en(maps.cond, listing.condition)}</span> : null}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[11px] text-gray-400">{t.ref} {ref}</span>
                    {whatsapp ? (
                      <a href={waLink(ref)} className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-semibold text-white">{t.ask}</a>
                    ) : settings.agency_phone ? (
                      <a href={`tel:${settings.agency_phone.replace(/\s/g, "")}`} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">{t.call}</a>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <footer className="mt-8 text-center text-xs text-gray-400">{t.footer}</footer>
    </div>
  );
}
