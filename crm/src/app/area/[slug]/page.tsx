import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { dealKind, placeName, priceUsd, toCatalogItem, type Lang } from "@/lib/catalog";
import { catalogLink } from "@/lib/channel";
import { AREA_INFO, areaSlug } from "@/lib/areas";
import { METRO, METRO_LINE_COLOR, metroName } from "@/lib/metro";
import { getSettings } from "@/lib/settings";
import { SITE_TEXT, siteBase, siteLang, sitePosts } from "@/lib/site";
import { DICT } from "@/app/catalog/i18n";
import { KIND_ORDER, NEAR_MINUTES, PLACE_EMOJI } from "@/app/catalog/places";
import { SiteHeader } from "../../flats/SiteHeader";
import { FlatCard } from "../../flats/FlatCard";

// A page per district for Google and for people new to Tbilisi: what the area
// is like, its prices and metro from our own listings, and the flats there now.

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> };

async function load(slug: string) {
  const posts = await sitePosts();
  const districts = [...new Set(posts.map((p) => p.district).filter(Boolean) as string[])];
  const district = districts.find((d) => areaSlug(d) === slug);
  if (!district) return null;
  return { district, posts: posts.filter((p) => p.district === district), districts: districts.filter((d) => d !== district), all: posts };
}

const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, { lang: l }] = await Promise.all([params, searchParams]);
  const data = await load(slug);
  // In metadata, so the 404 status is sent before the page starts streaming.
  if (!data) notFound();
  const lang = siteLang(l);
  const [settings, base] = await Promise.all([getSettings(), siteBase()]);
  const s = SITE_TEXT[lang];
  const name = placeName(data.district, lang);
  const url = `${base}/area/${slug}`;
  const title = `${s.areaTitle(name)} | ${settings.agency_name || "Tbilisi Homes"}`;
  const description = s.areaDescription(name, data.posts.length);
  const photo = data.posts.flatMap((p) => p.photos.filter((x) => x.kind !== "plan"))[0];
  return {
    title,
    description,
    alternates: { canonical: lang === "en" ? url : `${url}?lang=${lang}`, languages: { en: url, ru: `${url}?lang=ru`, ka: `${url}?lang=ka` } },
    openGraph: { title, description, url, type: "website", images: [{ url: photo ? `${base}/api/catalog/photo/${photo.id}` : `${base}/brand-logo.jpg` }] },
  };
}

export default async function AreaPage({ params, searchParams }: Props) {
  const [{ slug }, { lang: l }] = await Promise.all([params, searchParams]);
  const data = await load(slug);
  if (!data) notFound();
  const lang: Lang = siteLang(l);
  const s = SITE_TEXT[lang];
  const t = DICT[lang];
  const [settings, base] = await Promise.all([getSettings(), siteBase()]);
  const name = placeName(data.district, lang);
  const items = data.posts.map(toCatalogItem);
  const open = items.filter((i) => !i.closed);
  const q = lang === "en" ? "" : `?lang=${lang}`;

  // Numbers from our own listings (open ones).
  const avgRent = average(open.filter((i) => i.kind === "rent" && i.usd).map((i) => i.usd!));
  const avgM2 = average(open.filter((i) => i.kind === "sale" && i.usd && i.area && i.area >= 15).map((i) => i.usd! / i.area!));
  const stations = new Map<string, number>();
  for (const i of items) for (const m of i.metro) if (m.minutes <= 20) stations.set(m.id, Math.min(stations.get(m.id) ?? 99, m.minutes));
  const metro = [...stations].sort((a, b) => a[1] - b[1]).slice(0, 4);
  const looked = items.filter((i) => i.nearby);
  const near = KIND_ORDER.map((k) => ({ kind: k, share: looked.length ? looked.filter((i) => i.nearby!.some((n) => n.kind === k && n.minutes <= NEAR_MINUTES)).length / looked.length : 0 }))
    .filter((x) => x.share > 0);
  const blurb = AREA_INFO[data.district]?.[lang];
  const sorted = [...data.posts].sort((a, b) => Number(dealKind(a.dealType) !== "rent") - Number(dealKind(b.dealType) !== "rent") || (priceUsd(a.price, a.currency) ?? 0) - (priceUsd(b.price, b.currency) ?? 0));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Tbilisi", item: `${base}/flats${q}` },
      { "@type": "ListItem", position: 2, name, item: `${base}/area/${slug}${q}` },
    ],
  };

  return (
    <div className="mx-auto max-w-5xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <SiteHeader agency={settings.agency_name || "Tbilisi Homes"} lang={lang} path={`/area/${slug}`} tgLink={catalogLink(settings, base, null, lang, "w")} />
      <Link href={`/flats${q}`} className="mb-3 inline-block text-sm text-[#1d4f8c] hover:underline">{s.backToAll}</Link>

      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#0e2a4d] to-[#1d4f8c] p-5 text-white shadow-md">
        <h1 className="text-2xl font-bold">{s.areaTitle(name)}</h1>
        <p className="mt-1 text-sm text-white/80">{s.inArea(open.length)}</p>
        {blurb ? <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/90">{blurb}</p> : null}
        <a href={catalogLink(settings, base, null, lang, "w")} className="mt-4 inline-block rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#0e2a4d]">✈️ {s.openTg}</a>
      </section>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {avgRent ? (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
            <div className="text-xs text-gray-500">{s.avgRent}</div>
            <div className="mt-1 text-xl font-bold text-gray-900">${Math.round(avgRent).toLocaleString("en-US")}<span className="text-sm font-medium text-gray-500">{s.perMonth}</span></div>
          </div>
        ) : null}
        {avgM2 ? (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
            <div className="text-xs text-gray-500">{s.avgSaleM2}</div>
            <div className="mt-1 text-xl font-bold text-gray-900">${Math.round(avgM2).toLocaleString("en-US")}</div>
          </div>
        ) : null}
        {metro.length ? (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
            <div className="text-xs text-gray-500">🚇 {s.metroNear}</div>
            <ul className="mt-1 space-y-0.5 text-sm">
              {metro.map(([id, minutes]) => {
                const st = METRO.find((x) => x.id === id)!;
                return (
                  <li key={id} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: METRO_LINE_COLOR[st.lines[0]] }} />
                    <span className="font-medium text-gray-900">{metroName(id, lang)}</span>
                    <span className="text-gray-500">· {t.walkMin(minutes)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>

      {near.length ? (
        <section className="mt-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">{s.nearShare}</h2>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {near.map((x) => (
              <div key={x.kind} className="rounded-xl bg-gray-50 px-3 py-2">
                <div className="text-sm">{PLACE_EMOJI[x.kind]} {t.places[x.kind]}</div>
                <div className="text-lg font-bold text-[#1d4f8c]">{Math.round(x.share * 100)}%</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((post) => (
          <li key={post.id}>
            <FlatCard post={post} lang={lang} />
          </li>
        ))}
      </ul>

      {data.districts.length ? (
        <section className="mt-8">
          <h2 className="mb-2 text-base font-semibold text-gray-900">{s.otherAreas}</h2>
          <div className="flex flex-wrap gap-2">
            {data.districts.map((d) => (
              <Link key={d} href={`/area/${areaSlug(d)}${q}`} className="rounded-full bg-white px-3 py-1.5 text-sm text-gray-800 ring-1 ring-gray-200 hover:ring-[#1d4f8c]">
                {placeName(d, lang)} <span className="text-gray-400">· {data.all.filter((p) => p.district === d).length}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
