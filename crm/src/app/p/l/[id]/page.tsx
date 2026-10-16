import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { EN_CONDITION, EN_DEAL, EN_PLACE, EN_TYPE, PUBLIC_TEXT, RU_CONDITION, RU_DEAL, RU_PLACE, RU_TYPE, en } from "@/lib/segments";
import { getSettings } from "@/lib/settings";
import { fmtMoney, fmtNum } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Public card for one listing: our contact, no owner phone, EN / RU / KA. */
export default async function PublicListingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { id } = await params;
  const { lang: rawLang = "en" } = await searchParams;
  const lang = rawLang === "ru" ? "ru" : rawLang === "ka" ? "ka" : "en";
  const listing = await prisma.listing.findUnique({ where: { id: decodeURIComponent(id) }, include: { lead: { select: { hidden: true } } } });
  if (!listing || listing.lead?.hidden) notFound();
  const settings = await getSettings();
  const t = lang === "ru" ? PUBLIC_TEXT.ru : PUBLIC_TEXT.en;
  const maps =
    lang === "ru" ? { deal: RU_DEAL, type: RU_TYPE, place: RU_PLACE, cond: RU_CONDITION } : lang === "ka" ? { deal: {}, type: {}, place: {}, cond: {} } : { deal: EN_DEAL, type: EN_TYPE, place: EN_PLACE, cond: EN_CONDITION };
  const whatsapp = settings.agency_whatsapp.replace(/^\+/, "");
  const ref = `#${listing.site.toUpperCase().slice(0, 2)}-${listing.propertyId}`;
  const wa = whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`${lang === "ka" ? "გამარჯობა! მაინტერესებს" : t.interested} ${ref}`)}` : "";
  const perUnit = listing.dealType === "ქირავდება დღიურად" ? t.day : listing.dealType === "ქირავდება" ? t.month : "";
  const labels = lang === "ka"
    ? { rooms: "ოთახი", floor: "სართული", bedrooms: "საძინებელი", ask: "მოგვწერეთ WhatsApp-ზე", call: "დაგვირეკეთ", ref: "ID", footer: "ჩვენ ვართ თქვენი აგენტი: ნახვა, მოლაპარაკება, ხელშეკრულება.", area: "ფართი", bathrooms: "სველი წერტილი", condition: "მდგომარეობა", status: "სტატუსი" }
    : { rooms: t.rooms, floor: t.floor, bedrooms: t.bedrooms, ask: t.ask, call: t.call, ref: t.ref, footer: t.footer, area: lang === "ru" ? "Площадь" : "Area", bathrooms: lang === "ru" ? "Санузлы" : "Bathrooms", condition: lang === "ru" ? "Состояние" : "Condition", status: lang === "ru" ? "Дом" : "Building" };
  const facts: [string, string][] = [
    [labels.area, listing.areaM2 ? `${fmtNum(listing.areaM2)} m²` : ""],
    [labels.rooms, listing.rooms ? String(listing.rooms) : ""],
    [labels.bedrooms, listing.bedrooms ? String(listing.bedrooms) : ""],
    [labels.bathrooms, listing.bathrooms ? String(listing.bathrooms) : ""],
    [labels.floor, listing.floor != null ? `${listing.floor}${listing.totalFloors ? ` / ${listing.totalFloors}` : ""}` : ""],
    [labels.condition, en(maps.cond, listing.condition)],
    [labels.status, en(maps.cond, listing.status)],
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex items-center justify-between text-xs text-gray-500">
        <span>{settings.agency_name || t.agency}</span>
        <span className="flex gap-1">
          {(["en", "ru", "ka"] as const).map((l) => (
            <a key={l} href={`?lang=${l}`} className={`rounded px-1.5 py-0.5 font-semibold ${lang === l ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600"}`}>{l.toUpperCase()}</a>
          ))}
        </span>
      </div>
      <div className="ui-card overflow-hidden">
        {listing.image ? <img src={listing.image} alt="" className="max-h-[420px] w-full object-cover" /> : <div className="h-56 w-full bg-gray-100" />}
        <div className="p-5">
          <div className="text-3xl font-bold text-emerald-700">
            {fmtMoney(listing.priceUsd) || fmtMoney(listing.priceGel, "₾")}
            {perUnit ? <span className="text-sm font-normal text-gray-500"> {perUnit}</span> : null}
          </div>
          <h1 className="mt-1 text-xl font-semibold text-gray-900">
            {lang === "ka" ? listing.title : `${en(maps.deal, listing.dealType)} · ${en(maps.type, listing.propertyType)}${listing.rooms ? ` · ${listing.rooms} ${labels.rooms}` : ""}`}
          </h1>
          <p className="text-sm text-gray-600">
            {[en(maps.place, listing.neighbourhood), en(maps.place, listing.district), en(maps.place, listing.city)].filter(Boolean).join(", ")}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {facts.filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-gray-50 px-3 py-2">
                <dt className="text-[11px] uppercase tracking-wide text-gray-500">{k}</dt>
                <dd className="text-sm font-medium text-gray-900">{v}</dd>
              </div>
            ))}
          </dl>
          {listing.description && lang === "ka" ? <p className="mt-4 whitespace-pre-line text-sm text-gray-800">{listing.description}</p> : null}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {wa ? <a href={wa} className="rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white">{labels.ask}</a> : null}
            {settings.agency_phone ? <a href={`tel:${settings.agency_phone.replace(/\s/g, "")}`} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">{labels.call} {settings.agency_phone}</a> : null}
            <span className="ml-auto text-[11px] text-gray-400">{labels.ref} {ref}</span>
          </div>
        </div>
      </div>
      <footer className="mt-6 text-center text-xs text-gray-400">{labels.footer}</footer>
    </div>
  );
}
