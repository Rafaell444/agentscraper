import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { cleanPhones, extUser, myhomeId } from "@/lib/ext";

const STATUSES = ["ok", "none", "login", "blocked", "error"];

/**
 * POST { url, listingId?, phone?, status } from the extension.  A number goes
 * into the listing's lead (manualPhone, the same field agents fill by hand).
 * Works for queue items and for any MyHome listing an agent opens.
 */
export async function POST(request: Request) {
  const user = await extUser(request);
  if (!user) return Response.json({ ok: false, error: "bad key" }, { status: 401 });
  const body = ((await request.json().catch(() => ({}))) ?? {}) as { url?: string; listingId?: string; phone?: string; status?: string };
  const phone = cleanPhones(body.phone);
  const status = phone ? "ok" : STATUSES.includes(String(body.status)) && body.status !== "ok" ? String(body.status) : "error";

  const id = body.url ? myhomeId(body.url) : null;
  const listing = body.listingId
    ? await prisma.listing.findUnique({ where: { id: body.listingId }, select: { id: true } })
    : id
      ? await prisma.listing.findFirst({ where: { site: "myhome", propertyId: id }, select: { id: true } })
      : null;
  if (!listing) return Response.json({ ok: false, error: "not in CRM", phone });

  await prisma.lead.upsert({
    where: { listingId: listing.id },
    update: { phoneCheck: status, phoneCheckedAt: new Date(), ...(phone ? { manualPhone: phone } : {}) },
    create: { listingId: listing.id, phoneCheck: status, phoneCheckedAt: new Date(), manualPhone: phone || null },
  });
  if (phone) await logActivity(user.id, "phone", listing.id, `${phone} (extension)`);
  return Response.json({ ok: true, listingId: listing.id, phone, status });
}
