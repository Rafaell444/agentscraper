"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { isPartner, requireMember } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

function revalidateAll(listingId?: string | null, clientId?: string | null) {
  revalidatePath("/viewings");
  revalidatePath("/followups");
  revalidatePath("/");
  if (listingId) revalidatePath(`/listings/${listingId}`);
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

export async function createViewing(formData: FormData) {
  const user = await requireMember();
  const partner = isPartner(user);
  // A partner books for his own clients, as himself, by address (he does not see our listings).
  const listingId = partner ? null : String(formData.get("listingId") ?? "") || null;
  const clientId = String(formData.get("clientId") ?? "") || null;
  const agentId = partner ? user.id : String(formData.get("agentId") ?? "") || user.id;
  if (partner) {
    const client = clientId ? await prisma.client.findUnique({ where: { id: clientId }, select: { segment: true } }) : null;
    if (!client || client.segment !== user.segment) return;
  }
  const when = String(formData.get("scheduledAt") ?? "");
  const address = String(formData.get("address") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!when) return;
  const scheduledAt = new Date(when);
  if (Number.isNaN(scheduledAt.getTime())) return;
  await prisma.viewing.create({ data: { listingId, clientId, agentId, scheduledAt, address, note } });
  await logActivity(user.id, "viewing", listingId, scheduledAt.toISOString().slice(0, 16).replace("T", " "));
  revalidateAll(listingId, clientId);
}

/** A partner changes only his own viewings. */
async function canEditViewing(user: { id: string; role: string }, id: string): Promise<boolean> {
  if (!isPartner(user)) return true;
  const viewing = await prisma.viewing.findUnique({ where: { id }, select: { agentId: true } });
  return viewing?.agentId === user.id;
}

export async function setViewingStatus(formData: FormData) {
  const user = await requireMember();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["planned", "done", "cancelled", "no_show"].includes(status)) return;
  if (!(await canEditViewing(user, id))) return;
  const viewing = await prisma.viewing.update({ where: { id }, data: { status } });
  revalidateAll(viewing.listingId, viewing.clientId);
}

export async function deleteViewing(formData: FormData) {
  const user = await requireMember();
  const id = String(formData.get("id") ?? "");
  if (!id || !(await canEditViewing(user, id))) return;
  const viewing = await prisma.viewing.delete({ where: { id } });
  revalidateAll(viewing.listingId, viewing.clientId);
}
