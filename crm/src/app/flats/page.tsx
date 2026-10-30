import type { Metadata } from "next";
import Link from "next/link";
import { dealKind, headline, placeName, priceText, toCatalogItem, type DealKind } from "@/lib/catalog";
import { catalogLink } from "@/lib/channel";
import { metroName } from "@/lib/metro";
import { getSettings } from "@/lib/settings";
import { SITE_TEXT, siteBase, siteLang, sitePosts } from "@/lib/site";
import { DICT } from "@/app/catalog/i18n";
import { SiteHeader } from "./SiteHeader";

// Public list of all flats (the website's home page for Google).

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ lang?: string; deal?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { lang: l, deal } = await searchParams;
  const lang = siteLang(l);
  const [settings, base] = await Promise.all([getSettings(), siteBase()]);
  const s = SITE_TEXT[lang];
  const agency = settings.agency_name || "Tbilisi Homes";
  const title = deal === "rent" ? `${s.rentTitle} | ${agency}` : deal === "sale" ? `${s.saleTitle} | ${agency}` : deal === "daily" ? `${s.dailyTitle} | ${agency}` : s.siteTitle(agency);
  const url = `${base}/flats`;
  return {
    title,
    description: s.siteDescription,
    alternates: { canonical: lang === "en" ? url : `${url}?lang=${lang}`, languages: { en: url, ru: `${url}?lang=ru`, ka: `${url}?lang=ka` } },
    openGraph: { title, description: s.siteDescription, url, type: "website", images: [{ url: `${base}/brand-logo.jpg` }] },
    robots: { index: true, follow: true },
  };
}

export default async function FlatsPage({ searchParams }: Props) {
  const { lang: l, deal } = await searchParams;
  const lang = siteLang(l);
  const t = DICT[lang];
  const s = SITE_TEXT[lang];
  const [settings, base, posts] = await Promise.all([getSettings(), siteBase(), sitePosts()]);
  const kinds = (["rent", "sale", "daily"] as DealKind[]).filter((k) => posts.some((p) => dealKind(p.dealType) === k));
  const shown = posts.filter((p) => !deal || dealKind(p.dealType) === deal);
  const q = (extra: Record<string, string>) => {
    const params = new URLSearchParams({ ...(lang === "en" ? {} : { lang }), ...extra });
    return params.size ? `?${params}` : "";
  };

  return (
    <div className="mx-auto max-w-5xl">
      <SiteHeader agency={settings.agency_name || "Tbilisi Homes"} lang={lang} path="/flats" tgLink={catalogLink(settings, base, null, lang, "w")} />
      <h1 className="text-2xl font-bold text-gray-900">{deal === "rent" ? s.rentTitle : deal === "sale" ? s.saleTitle : deal === "daily" ? s.dailyTitle : s.siteTitle(settings.agency_name || "Tbilisi Homes").split(" — ")[0]}</h1>
      <p className="mt-1 max-w-2xl text-sm text-gray-600">{s.siteDescription}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/flats${q({})}`} className={`rounded-full px-3 py-1 font-semibold ${!deal ? "bg-[#1d4f8c] text-white" : "bg-white text-gray-700 ring-1 ring-gray-200"}`}>{s.all}</Link>
        {kinds.map((k) => (
          <Link key={k} href={`/flats${q({ deal: k })}`} className={`rounded-full px-3 py-1 font-semibold ${deal === k ? "bg-[#1d4f8c] text-white" : "bg-white text-gray-700 ring-1 ring-gray-200"}`}>{t[k]}</Link>
        ))}
        <span className="ml-auto text-xs text-gray-500">{s.listings(shown.length)}</span>
      </div>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((post) => {
          const item = toCatalogItem(post);
          const metro = item.metro.find((m) => m.minutes <= 15);
          return (
            <li key={post.id}>
              <Link href={`/flat/${post.refNo}${q({})}`} className="block overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {item.photos[0] ? <img src={item.photos[0]} alt={headline(post, lang)} loading="lazy" className={`h-48 w-full object-cover ${item.closed ? "grayscale-[60%]" : ""}`} /> : <div className="flex h-48 items-center justify-center bg-gray-100 text-3xl">🏠</div>}
                  {item.closed ? <span className="absolute left-2 top-2 rounded-md bg-[#0e2a4d] px-2 py-0.5 text-xs font-black uppercase text-white">✓ {item.kind === "sale" ? t.sold : t.rented}</span> : null}
                </div>
                <div className="space-y-1 p-3">
                  <div className={`text-lg font-bold ${item.closed ? "text-gray-400 line-through" : "text-gray-900"}`}>{priceText(post.price, post.currency, item.kind, lang)}</div>
                  <h2 className="truncate text-sm font-medium text-gray-800">{headline(post, lang)}{item.area ? ` · ${item.area} m²` : ""}</h2>
                  <div className="truncate text-xs text-gray-500">📍 {placeName(post.location || post.district, lang)}</div>
                  {metro ? <div className="text-xs text-gray-500">🚇 {metroName(metro.id, lang)} · {t.walkMin(metro.minutes)}</div> : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
