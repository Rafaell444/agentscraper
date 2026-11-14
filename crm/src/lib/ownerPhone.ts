import { prisma } from "./db";

type ListingPhoneInfo = { phone: string | null; propertyKey: string | null; lead?: { manualPhone: string | null } | null };

/** The owner's number for scraped listings: their own, the one an agent or
 * the extension found, or one from another site's copy of the same flat.
 * Staff only: never shown to a partner. */
export async function ownerPhones(listings: (ListingPhoneInfo & { id: string })[]): Promise<Record<string, { phone: string; from?: string }>> {
  const result: Record<string, { phone: string; from?: string }> = {};
  const missingKeys: string[] = [];
  for (const l of listings) {
    const phone = l.phone || l.lead?.manualPhone;
    if (phone) result[l.id] = { phone };
    else if (l.propertyKey) missingKeys.push(l.propertyKey);
  }
  if (missingKeys.length) {
    const copies = await prisma.listing.findMany({ where: { propertyKey: { in: missingKeys }, NOT: [{ phone: null }, { phone: "" }] }, select: { propertyKey: true, phone: true, siteName: true } });
    for (const l of listings) {
      if (result[l.id] || !l.propertyKey) continue;
      const copy = copies.find((c) => c.propertyKey === l.propertyKey && c.phone);
      if (copy?.phone) result[l.id] = { phone: copy.phone, from: copy.siteName };
    }
  }
  return result;
}
