"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

function num(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").replace(/[^\d.]/g, "");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function createDeal(formData: FormData) {
  const user = await requireUser();
  const listingId = String(formData.get("listingId") ?? "") || null;
  const clientId = String(formData.get("clientId") ?? "") || null;
  const agentId = String(formData.get("agentId") ?? "") || user.id;
  const kind = String(formData.get("kind") ?? "rent");
  const amount = num(formData.get("amount"));
  let commission = num(formData.get("commission"));
  const pct = num(formData.get("commissionPct"));
  if (commission == null && pct != null && amount != null) commission = Math.round((amount * pct) / 100);
  const closedRaw = String(formData.get("closedAt") ?? "");
  const closedAt = closedRaw ? new Date(closedRaw) : new Date();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!["sale", "rent", "daily"].includes(kind)) return;
  await prisma.deal.create({ data: { listingId, clientId, agentId, kind, amount, commission, closedAt, note } });
  if (listingId) {
    await prisma.lead.upsert({ where: { listingId }, update: { status: "signed" }, create: { listingId, status: "signed" } });
  }
  if (clientId) await prisma.client.update({ where: { id: clientId }, data: { status: "closed_won" } });
  await logActivity(user.id, "deal", listingId, `${kind} ${amount ?? ""} / საკომისიო ${commission ?? ""}`);
  revalidatePath("/deals");
  revalidatePath("/");
  if (listingId) revalidatePath(`/listings/${listingId}`);
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

export async function deleteDeal(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.deal.delete({ where: { id } });
  revalidatePath("/deals");
}
