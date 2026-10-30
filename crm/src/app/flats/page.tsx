import type { Metadata } from "next";
import Link from "next/link";
import { dealKind, placeName, type DealKind } from "@/lib/catalog";
import { catalogLink } from "@/lib/channel";
import { areaSlug } from "@/lib/areas";
import { getSettings } from "@/lib/settings";
import { SITE_TEXT, siteBase, siteLang, sitePosts } from "@/lib/site";
import { DICT } from "@/app/catalog/i18n";
import { SiteHeader } from "./SiteHeader";
import { FlatCard } from "./FlatCard";

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
  const counts = new Map<string, number>();
  for (const p of posts) if (p.district) counts.set(p.district, (counts.get(p.district) ?? 0) + 1);
  const districts = [...counts].sort((a, b) => b[1] - a[1]);
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
        {shown.map((post) => (
          <li key={post.id}>
            <FlatCard post={post} lang={lang} />
          </li>
        ))}
      </ul>

      {districts.length ? (
        <section className="mt-8">
          <h2 className="mb-2 text-base font-semibold text-gray-900">{s.byDistrict}</h2>
          <div className="flex flex-wrap gap-2">
            {districts.map(([d, n]) => (
              <Link key={d} href={`/area/${areaSlug(d)}${q({})}`} className="rounded-full bg-white px-3 py-1.5 text-sm text-gray-800 ring-1 ring-gray-200 hover:ring-[#1d4f8c]">
                {placeName(d, lang)} <span className="text-gray-400">· {n}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
