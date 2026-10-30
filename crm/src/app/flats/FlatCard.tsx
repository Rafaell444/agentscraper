import Link from "next/link";
import { headline, placeName, priceText, toCatalogItem, type Lang } from "@/lib/catalog";
import { metroName } from "@/lib/metro";
import { DICT } from "@/app/catalog/i18n";

type Post = Parameters<typeof toCatalogItem>[0];

/** One flat in the public website's lists (/flats, /area/vake). */
export function FlatCard({ post, lang }: { post: Post; lang: Lang }) {
  const t = DICT[lang];
  const item = toCatalogItem(post);
  const metro = item.metro.find((m) => m.minutes <= 15);
  return (
    <Link href={`/flat/${post.refNo}${lang === "en" ? "" : `?lang=${lang}`}`} className="block overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {item.photos[0] ? <img src={item.photos[0]} alt={headline(post, lang)} loading="lazy" className={`brand-ph h-48 w-full object-cover ${item.closed ? "grayscale-[60%]" : ""}`} /> : <div className="flex h-48 items-center justify-center bg-gray-100 text-3xl">🏠</div>}
        {item.closed ? <span className="absolute left-2 top-2 rounded-md bg-[#0e2a4d] px-2 py-0.5 text-xs font-black uppercase text-white">✓ {item.kind === "sale" ? t.sold : t.rented}</span> : null}
      </div>
      <div className="space-y-1 p-3">
        <div className={`text-lg font-bold ${item.closed ? "text-gray-400 line-through" : "text-gray-900"}`}>{priceText(post.price, post.currency, item.kind, lang)}</div>
        <h3 className="truncate text-sm font-medium text-gray-800">{headline(post, lang)}{item.area ? ` · ${item.area} m²` : ""}</h3>
        <div className="truncate text-xs text-gray-500">📍 {placeName(post.location || post.district, lang)}</div>
        {metro ? <div className="text-xs text-gray-500">🚇 {metroName(metro.id, lang)} · {t.walkMin(metro.minutes)}</div> : null}
      </div>
    </Link>
  );
}
