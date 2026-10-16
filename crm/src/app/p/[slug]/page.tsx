import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { EN_DEAL, EN_PLACE, EN_TYPE, en, segmentBySlug, segmentWhere } from "@/lib/segments";
import { getSettings } from "@/lib/settings";
import { fmtMoney, fmtNum } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const segment = segmentBySlug(slug);
  return { title: segment?.titleEn ?? "Rentals", robots: { index: false, follow: false } };
}

function daysAgo(date: Date | null): string {
  if (!date) return "";
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

export default async function PublicSegmentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const segment = segmentBySlug(slug);
  if (!segment) notFound();
  const [listings, settings] = await Promise.all([
    prisma.listing.findMany({ where: segmentWhere(segment), orderBy: { collectedAt: "desc" }, take: 120 }),
    getSettings(),
  ]);
  const whatsapp = settings.agency_whatsapp.replace(/^\+/, "");
  const waLink = (ref: string) => (whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hello! I am interested in rental ${ref}`)}` : "");

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-5 rounded-2xl bg-emerald-700 px-5 py-6 text-white shadow-md">
        <div className="text-xs uppercase tracking-wide text-emerald-200">{settings.agency_name || "Real estate agency"}</div>
        <h1 className="mt-1 text-2xl font-bold">{segment.titleEn}</h1>
        <p className="mt-2 max-w-2xl text-sm text-emerald-50">{settings.public_intro_en || segment.descriptionEn}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {settings.agency_phone ? (
            <a href={`tel:${settings.agency_phone.replace(/\s/g, "")}`} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-emerald-800">📞 {settings.agency_phone}</a>
          ) : null}
          {whatsapp ? (
            <a href={waLink("")} className="rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white">WhatsApp us</a>
          ) : null}
        </div>
      </header>

      <p className="mb-3 text-sm text-gray-500">{listings.length} listings · updated automatically every 30 minutes</p>

      {listings.length === 0 ? (
        <div className="ui-card p-8 text-center text-gray-500">No listings at the moment. Contact us and we will find one for you.</div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => {
            const ref = `#${listing.site.toUpperCase().slice(0, 2)}-${listing.propertyId}`;
            return (
              <li key={listing.id} className="ui-card overflow-hidden">
                {listing.image ? <img src={listing.image} alt="" className="h-44 w-full object-cover" /> : <div className="h-44 w-full bg-gray-100" />}
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-lg font-bold text-emerald-700">{fmtMoney(listing.priceUsd) || fmtMoney(listing.priceGel, "₾")}<span className="text-xs font-normal text-gray-500"> / month</span></div>
                    <span className="text-[11px] text-gray-400">{daysAgo(listing.collectedAt)}</span>
                  </div>
                  <div className="text-sm font-medium text-gray-900">
                    {en(EN_DEAL, listing.dealType)} · {en(EN_TYPE, listing.propertyType)}{listing.rooms ? ` · ${listing.rooms} rooms` : ""}
                  </div>
                  <div className="text-sm text-gray-600">
                    {en(EN_PLACE, listing.neighbourhood) || en(EN_PLACE, listing.district)}{listing.district && listing.neighbourhood ? `, ${en(EN_PLACE, listing.district)}` : ""}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500">
                    {listing.areaM2 ? <span>{fmtNum(listing.areaM2)} m²</span> : null}
                    {listing.floor != null ? <span>floor {listing.floor}{listing.totalFloors ? `/${listing.totalFloors}` : ""}</span> : null}
                    {listing.bedrooms ? <span>{listing.bedrooms} bedrooms</span> : null}
                    {listing.condition ? <span>{listing.condition}</span> : null}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[11px] text-gray-400">Ref {ref}</span>
                    {whatsapp ? (
                      <a href={waLink(ref)} className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-semibold text-white">Ask on WhatsApp</a>
                    ) : settings.agency_phone ? (
                      <a href={`tel:${settings.agency_phone.replace(/\s/g, "")}`} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">Call us</a>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <footer className="mt-8 text-center text-xs text-gray-400">We act as your agent: viewing, negotiation and contract. Owner contacts are shared after a short call.</footer>
    </div>
  );
}
