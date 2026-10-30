import type { Metadata, Viewport } from "next";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { publicWhere, toCatalogItem } from "@/lib/catalog";
import { catalogLink, managerLink } from "@/lib/channel";
import { shareBase } from "@/lib/shareUrl";
import { CatalogApp } from "./CatalogApp";

// The Telegram mini app (also works as a normal web page).  Every listing is
// sent to the browser once and filtered there, so filters and the map are instant.

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  const name = settings.agency_name || "Tbilisi apartments";
  return { title: `${name} — catalog`, description: "Apartments for rent and sale in Tbilisi", robots: { index: false } };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, viewportFit: "cover" };

export default async function CatalogPage() {
  const [posts, settings] = await Promise.all([
    prisma.sharedPost.findMany({
      where: publicWhere(),
      orderBy: [{ channelPostedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
      take: 1000,
      include: { photos: { orderBy: [{ position: "asc" }, { id: "asc" }], select: { id: true, kind: true } } },
    }),
    getSettings(),
  ]);
  const base = await shareBase(settings.public_base_url);
  // {ref} and {lang} are filled in by the app; _s marks the link as shared by a friend (stats).
  const linkTemplate = catalogLink(settings, base, 987654321, "en", "s").replace("987654321", "{ref}").replace("_en_s", "_{lang}_s").replace("lang=en", "lang={lang}");
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <script src="https://telegram.org/js/telegram-web-app.js" />
      <CatalogApp
        items={posts.map(toCatalogItem)}
        agency={settings.agency_name || "Tbilisi Homes"}
        manager={managerLink(settings.catalog_manager)}
        phone={settings.agency_phone || null}
        linkTemplate={linkTemplate}
      />
    </>
  );
}
