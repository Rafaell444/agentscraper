"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

function revalidateAll(listingId?: string | null, clientId?: string | null) {
  revalidatePath("/viewings");
  revalidatePath("/followups");
  revalidatePath("/");
  if (listingId) revalidatePath(`/listings/${listingId}`);
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

export async function createViewing(formData: FormData) {
  const user = await requireUser();
  const listingId = String(formData.get("listingId") ?? "") || null;
  const clientId = String(formData.get("clientId") ?? "") || null;
  const agentId = String(formData.get("agentId") ?? "") || user.id;
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

export async function setViewingStatus(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["planned", "done", "cancelled", "no_show"].includes(status)) return;
  const viewing = await prisma.viewing.update({ where: { id }, data: { status } });
  revalidateAll(viewing.listingId, viewing.clientId);
}

export async function deleteViewing(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const viewing = await prisma.viewing.delete({ where: { id } });
  revalidateAll(viewing.listingId, viewing.clientId);
}
