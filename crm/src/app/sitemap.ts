import type { MetadataRoute } from "next";
import { siteBase, sitePosts } from "@/lib/site";
import { areaSlug } from "@/lib/areas";

export const dynamic = "force-dynamic";

/** /sitemap.xml: the public flat and district pages in English, Russian and Georgian. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [base, posts] = await Promise.all([siteBase(), sitePosts()]);
  const page = (path: string, modified: Date, priority: number) => ({
    url: `${base}${path}`,
    lastModified: modified,
    priority,
    alternates: { languages: { en: `${base}${path}`, ru: `${base}${path}?lang=ru`, ka: `${base}${path}?lang=ka` } },
  });
  const districts = [...new Set(posts.map((p) => p.district).filter(Boolean) as string[])];
  return [
    page("/flats", new Date(), 1),
    ...districts.map((d) => page(`/area/${areaSlug(d)}`, new Date(), 0.9)),
    ...posts.filter((p) => p.availability === "available" || p.availability === "reserved").map((p) => page(`/flat/${p.refNo}`, p.updatedAt, 0.8)),
  ];
}
