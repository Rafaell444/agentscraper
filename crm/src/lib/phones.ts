import { prisma } from "./db";

/** Last 9 digits of a Georgian number ("+995 599 12-34-56" -> "599123456"). */
export function phoneDigits(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : "";
}

export type PhoneMatch = {
  kind: "listing" | "banner";
  id: string;
  title: string;
  href: string;
  site: string;
  price: string;
  place: string;
  date: Date | null;
  archived: boolean;
};

/** Everything in the CRM with this phone number: collected listings (site
 * number or one an agent found by hand) and street banners. */
export async function findPhoneMatches(phone: string | null | undefined, excludeBannerId?: string): Promise<PhoneMatch[]> {
  const digits = phoneDigits(phone);
  if (!digits) return [];
  const [listings, banners] = await Promise.all([
    prisma.listing.findMany({
      where: { OR: [{ phone: { contains: digits } }, { lead: { manualPhone: { contains: digits } } }] },
      select: { id: true, title: true, siteName: true, priceUsd: true, priceGel: true, neighbourhood: true, district: true, collectedAt: true, archived: true },
      orderBy: { collectedAt: "desc" },
      take: 50,
    }),
    prisma.streetBanner.findMany({
      where: { phoneDigits: digits, ...(excludeBannerId ? { id: { not: excludeBannerId } } : {}) },
      select: { id: true, address: true, dealType: true, propertyType: true, price: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  return [
    ...listings.map((l) => ({
      kind: "listing" as const,
      id: l.id,
      title: l.title ?? l.id,
      href: `/listings/${encodeURIComponent(l.id)}`,
      site: l.siteName,
      price: l.priceUsd ? `$${Math.round(l.priceUsd).toLocaleString("en-US")}` : l.priceGel ? `₾${Math.round(l.priceGel).toLocaleString("en-US")}` : "",
      place: l.neighbourhood ?? l.district ?? "",
      date: l.collectedAt,
      archived: l.archived,
    })),
    ...banners.map((b) => ({
      kind: "banner" as const,
      id: b.id,
      title: [b.dealType, b.propertyType].filter(Boolean).join(" ") || "ბანერი",
      href: `/banners/${b.id}`,
      site: "ქუჩის ბანერი",
      price: b.price ? `$${Math.round(b.price).toLocaleString("en-US")}` : "",
      place: b.address,
      date: b.createdAt,
      archived: false,
    })),
  ];
}

/** Match counts and lists for many numbers with two queries in total (banner list). */
export async function findPhoneMatchesMany(items: { phone: string | null; bannerId: string }[]): Promise<PhoneMatch[][]> {
  const digitsList = Array.from(new Set(items.map((item) => phoneDigits(item.phone)).filter(Boolean)));
  if (!digitsList.length) return items.map(() => []);
  const [listings, banners] = await Promise.all([
    prisma.listing.findMany({
      where: { OR: digitsList.flatMap((digits) => [{ phone: { contains: digits } }, { lead: { manualPhone: { contains: digits } } }]) },
      select: { id: true, title: true, siteName: true, priceUsd: true, priceGel: true, neighbourhood: true, district: true, collectedAt: true, archived: true, phone: true, lead: { select: { manualPhone: true } } },
      orderBy: { collectedAt: "desc" },
      take: 500,
    }),
    prisma.streetBanner.findMany({
      where: { phoneDigits: { in: digitsList } },
      select: { id: true, address: true, dealType: true, propertyType: true, price: true, createdAt: true, phoneDigits: true },
    }),
  ]);
  return items.map((item) => {
    const digits = phoneDigits(item.phone);
    if (!digits) return [];
    const own = listings.filter((l) => (l.phone ?? "").includes(digits) || (l.lead?.manualPhone ?? "").includes(digits));
    const others = banners.filter((b) => b.phoneDigits === digits && b.id !== item.bannerId);
    return [
      ...own.map((l) => ({
        kind: "listing" as const,
        id: l.id,
        title: l.title ?? l.id,
        href: `/listings/${encodeURIComponent(l.id)}`,
        site: l.siteName,
        price: l.priceUsd ? `$${Math.round(l.priceUsd).toLocaleString("en-US")}` : l.priceGel ? `₾${Math.round(l.priceGel).toLocaleString("en-US")}` : "",
        place: l.neighbourhood ?? l.district ?? "",
        date: l.collectedAt,
        archived: l.archived,
      })),
      ...others.map((b) => ({
        kind: "banner" as const,
        id: b.id,
        title: [b.dealType, b.propertyType].filter(Boolean).join(" ") || "ბანერი",
        href: `/banners/${b.id}`,
        site: "ქუჩის ბანერი",
        price: b.price ? `$${Math.round(b.price).toLocaleString("en-US")}` : "",
        place: b.address,
        date: b.createdAt,
        archived: false,
      })),
    ];
  });
}
