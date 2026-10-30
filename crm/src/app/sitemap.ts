import type { MetadataRoute } from "next";
import { siteBase, sitePosts } from "@/lib/site";

export const dynamic = "force-dynamic";

/** /sitemap.xml: the public flat pages in English, Russian and Georgian. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [base, posts] = await Promise.all([siteBase(), sitePosts()]);
  const page = (path: string, modified: Date, priority: number) => ({
    url: `${base}${path}`,
    lastModified: modified,
    priority,
    alternates: { languages: { en: `${base}${path}`, ru: `${base}${path}?lang=ru`, ka: `${base}${path}?lang=ka` } },
  });
  return [
    page("/flats", new Date(), 1),
    ...posts.filter((p) => p.availability === "available" || p.availability === "reserved").map((p) => page(`/flat/${p.refNo}`, p.updatedAt, 0.8)),
  ];
}
