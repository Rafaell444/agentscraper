import type { MetadataRoute } from "next";
import { siteBase } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Only the public website is for search engines; the CRM stays private. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = await siteBase();
  return {
    rules: [{ userAgent: "*", allow: ["/flats", "/flat/", "/api/catalog/photo/", "/brand-logo.jpg"], disallow: "/" }],
    sitemap: `${base}/sitemap.xml`,
  };
}
