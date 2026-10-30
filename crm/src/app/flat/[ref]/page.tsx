import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { DEAL_LABEL, FEATURES, PETS, photoUrl, dealKind, headline, isPublic, placeName, priceText, termText, toCatalogItem, typeLabel, type Lang } from "@/lib/catalog";
import { catalogLink, managerLink } from "@/lib/channel";
import { metroName } from "@/lib/metro";
import { mapView } from "@/lib/map";
import { getSettings } from "@/lib/settings";
import { SITE_TEXT, flatTitle, siteBase, siteLang } from "@/lib/site";
import { areaSlug } from "@/lib/areas";
import { DICT } from "@/app/catalog/i18n";
import { Gallery } from "@/app/s/[token]/Gallery";
import { SiteHeader } from "../../flats/SiteHeader";

// A public page for one flat, for Google and for people without Telegram.

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ ref: string }>; searchParams: Promise<{ lang?: string }> };

async function load(refText: string) {
  const ref = Number(refText);
  if (!Number.isInteger(ref) || ref <= 0) return null;
  const post = await prisma.sharedPost.findFirst({
    where: { refNo: ref },
    include: { photos: { orderBy: [{ position: "asc" }, { id: "asc" }], select: { id: true, kind: true } } },
  });
  return post && isPublic(post) ? post : null;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ ref }, { lang: l }] = await Promise.all([params, searchParams]);
  const post = await load(ref);
  // In metadata, so the 404 status is sent before the page starts streaming.
  if (!post) notFound();
  const lang = siteLang(l);
  const [settings, base] = await Promise.all([getSettings(), siteBase()]);
  const item = toCatalogItem(post);
  const title = `${flatTitle(post, lang)} | ${settings.agency_name || "Tbilisi Homes"}`;
  const description = (item.description[lang] || SITE_TEXT[lang].siteDescription).replace(/\s+/g, " ").slice(0, 160);
  const url = `${base}/flat/${post.refNo}`;
  return {
    title,
    description,
    alternates: { canonical: lang === "en" ? url : `${url}?lang=${lang}`, languages: { en: url, ru: `${url}?lang=ru`, ka: `${url}?lang=ka` } },
    openGraph: { title, description, url, type: "website", images: item.photos[0] ? [{ url: `${base}${item.photos[0]}` }] : undefined },
    robots: { index: !item.closed, follow: true },
  };
}

export default async function FlatPage({ params, searchParams }: Props) {
  const [{ ref }, { lang: l }] = await Promise.all([params, searchParams]);
  const post = await load(ref);
  if (!post) notFound();
  const lang: Lang = siteLang(l);
  const t = DICT[lang];
  const s = SITE_TEXT[lang];
  const [settings, base] = await Promise.all([getSettings(), siteBase()]);
  const item = toCatalogItem(post);
  const kind = dealKind(post.dealType);
  const tgLink = catalogLink(settings, base, post.refNo, lang, "w");
  const manager = managerLink(settings.catalog_manager);
  const map = item.point ? mapView(item.point.lat, item.point.lng, item.point.exact ? "exact" : "approx") : null;
  const place = placeName(post.location || post.district, lang);
  const description = item.description[lang];
  const facts = [
    [t.type, typeLabel(item.type, lang)],
    [t.rooms, item.rooms],
    [t.bedrooms, item.bedrooms],
    [t.baths, item.bathrooms],
    [t.area, item.area ? `${item.area} m²` : null],
    [t.floor, item.floor ? `${item.floor}${item.totalFloors ? ` / ${item.totalFloors}` : ""}` : null],
    [t.perM2, kind === "sale" && item.usd && item.area ? `$${Math.round(item.usd / item.area).toLocaleString("en-US")}` : null],
    [t.term, kind === "rent" && item.leaseTerm ? termText(item.leaseTerm, lang) : null],
  ].filter(([, v]) => v != null && v !== "") as [string, string | number][];

  const similar = (await prisma.sharedPost.findMany({
    where: { catalog: true, availability: "available", refNo: { not: null }, id: { not: post.id }, dealType: post.dealType, ...(post.district ? { district: post.district } : {}) },
    take: 6,
    orderBy: { updatedAt: "desc" },
    include: { photos: { where: { kind: "photo" }, orderBy: [{ position: "asc" }, { id: "asc" }], take: 1, select: { id: true } } },
  }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: headline(post, lang),
    url: `${base}/flat/${post.refNo}`,
    datePosted: (post.channelPostedAt ?? post.createdAt).toISOString(),
    image: item.photos.slice(0, 5).map((p) => `${base}${p}`),
    description: description.slice(0, 500),
    offers: post.price != null ? { "@type": "Offer", price: post.price, priceCurrency: post.currency, availability: item.closed ? "https://schema.org/SoldOut" : "https://schema.org/InStock", businessFunction: kind === "sale" ? "http://purl.org/goodrelations/v1#Sell" : "http://purl.org/goodrelations/v1#LeaseOut" } : undefined,
    about: {
      "@type": item.type === "კერძო სახლი" ? "House" : "Apartment",
      numberOfRooms: item.rooms ?? undefined,
      numberOfBedrooms: item.bedrooms ?? undefined,
      floorSize: item.area ? { "@type": "QuantitativeValue", value: item.area, unitCode: "MTK" } : undefined,
      address: { "@type": "PostalAddress", addressLocality: "Tbilisi", addressRegion: placeName(post.district, lang) || undefined, addressCountry: "GE" },
      geo: item.point ? { "@type": "GeoCoordinates", latitude: item.point.lat, longitude: item.point.lng } : undefined,
    },
  };

  return (
    <div className="mx-auto max-w-3xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <SiteHeader agency={settings.agency_name || "Tbilisi Homes"} lang={lang} path={`/flat/${post.refNo}`} tgLink={catalogLink(settings, base, null, lang, "w")} />

      <Link href={`/flats${lang === "en" ? "" : `?lang=${lang}`}`} className="mb-3 inline-block text-sm text-[#1d4f8c] hover:underline">{s.backToAll}</Link>

      <article className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="relative">
          <Gallery urls={[...item.photos, ...item.plans]} />
          {item.closed ? (
            <span className="pointer-events-none absolute left-3 top-3 rounded-lg bg-[#0e2a4d] px-3 py-1 text-sm font-black uppercase tracking-wide text-white">✓ {kind === "sale" ? t.sold : t.rented}</span>
          ) : null}
        </div>
        <div className="space-y-4 p-5">
          <div>
            <div className="text-xs text-gray-500">#{post.refNo} · {DEAL_LABEL[kind][lang]}</div>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">{headline(post, lang)}{item.area ? `, ${item.area} m²` : ""}</h1>
            <div className={`mt-1 text-2xl font-extrabold ${item.closed ? "text-gray-400 line-through" : "text-[#1d4f8c]"}`}>{priceText(post.price, post.currency, kind, lang)}</div>
            {place ? <div className="mt-1 text-sm text-gray-600">📍 {place}{post.district ? <> · <Link href={`/area/${areaSlug(post.district)}${lang === "en" ? "" : `?lang=${lang}`}`} className="text-[#1d4f8c] hover:underline">{SITE_TEXT[lang].aboutArea(placeName(post.district, lang))} →</Link></> : null}</div> : null}
            {item.metro.filter((m) => m.minutes <= 15).slice(0, 3).map((m) => (
              <div key={m.id} className="text-sm text-gray-600">🚇 {metroName(m.id, lang)} · {t.walkMin(m.minutes)}</div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {!item.closed ? <a href={tgLink} className="rounded-xl bg-[#1d4f8c] px-5 py-3 text-sm font-semibold text-white shadow hover:bg-[#0e2a4d]">✈️ {s.openTg}</a> : null}
            {manager ? <a href={manager} className="rounded-xl border border-[#1d4f8c] px-5 py-3 text-sm font-semibold text-[#1d4f8c]">💬 {s.writeManager}</a> : null}
            {settings.agency_phone ? <a href={`tel:${settings.agency_phone.replace(/[^\d+]/g, "")}`} className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-800">📞 {settings.agency_phone}</a> : null}
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-4">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] text-gray-500">{label}</dt>
                <dd className="text-sm font-semibold text-gray-900">{value}</dd>
              </div>
            ))}
          </dl>

          {item.features.length || (item.pets && PETS[item.pets]) ? (
            <div>
              <h2 className="mb-2 text-sm font-semibold">{t.features}</h2>
              <ul className="flex flex-wrap gap-1.5">
                {item.pets && PETS[item.pets] ? <li className="rounded-full bg-gray-100 px-2.5 py-1 text-xs">🐾 {PETS[item.pets][lang]}</li> : null}
                {item.features.map((k) => {
                  const f = FEATURES.find((x) => x.key === k)!;
                  return <li key={k} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs">{f.emoji} {f[lang]}</li>;
                })}
              </ul>
            </div>
          ) : null}

          {description ? (
            <div>
              <h2 className="mb-1 text-sm font-semibold">{t.description}</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-gray-800">{description}</p>
            </div>
          ) : null}

          {item.video?.kind === "iframe" ? (
            <iframe title="video" src={item.video.src} allowFullScreen className={`w-full rounded-xl ${item.video.vertical ? "mx-auto aspect-[9/16] max-h-[640px] max-w-[360px]" : "aspect-video"}`} />
          ) : item.video ? (
            <video src={item.video.src} controls playsInline className="max-h-[640px] w-full rounded-xl bg-black" />
          ) : null}
          {item.tour ? <iframe title="3D tour" src={item.tour} allowFullScreen className="h-[420px] w-full rounded-xl border-0" /> : null}

          {map ? (
            <div>
              <h2 className="mb-2 text-sm font-semibold">{t.location}</h2>
              <iframe title="map" src={map.embedUrl} className="h-64 w-full rounded-xl border-0" loading="lazy" referrerPolicy="no-referrer" />
              {!map.exact ? <p className="mt-1 text-xs text-gray-500">{t.approxNote}</p> : null}
            </div>
          ) : null}

          {!item.closed ? (
            <div className="rounded-xl bg-[#0e2a4d] p-4 text-white">
              <div className="font-bold">{s.ctaTitle}</div>
              <p className="mt-1 text-sm text-white/80">{s.ctaText}</p>
              <a href={tgLink} className="mt-3 inline-block rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#0e2a4d]">✈️ {s.openTg}</a>
            </div>
          ) : null}
        </div>
      </article>

      {similar.length ? (
        <section className="mt-6">
          <h2 className="mb-2 text-base font-semibold">{t.similar}</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {similar.map((p) => (
              <li key={p.id}>
                <Link href={`/flat/${p.refNo}${lang === "en" ? "" : `?lang=${lang}`}`} className="block overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 hover:shadow-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.photos[0] ? <img src={photoUrl(p.photos[0].id)} alt={headline(p, lang)} loading="lazy" className="h-32 w-full object-cover" /> : <div className="flex h-32 items-center justify-center bg-gray-100 text-2xl">🏠</div>}
                  <div className="p-2">
                    <div className="text-sm font-bold">{priceText(p.price, p.currency, dealKind(p.dealType), lang)}</div>
                    <div className="truncate text-xs text-gray-600">{headline(p, lang)}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
