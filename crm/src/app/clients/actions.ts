"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

function num(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function clientData(formData: FormData) {
  const moveIn = String(formData.get("moveIn") ?? "");
  return {
    name: String(formData.get("name") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim() || null,
    messenger: String(formData.get("messenger") ?? "").trim() || null,
    nationality: String(formData.get("nationality") ?? "").trim() || null,
    language: String(formData.get("language") ?? "").trim() || null,
    segment: String(formData.get("segment") ?? "").trim() || null,
    dealType: String(formData.get("dealType") ?? "").trim() || null,
    budgetMin: num(formData.get("budgetMin")),
    budgetMax: num(formData.get("budgetMax")),
    roomsMin: num(formData.get("roomsMin")) != null ? Math.round(num(formData.get("roomsMin"))!) : null,
    areas: String(formData.get("areas") ?? "").trim() || null,
    moveIn: moveIn ? new Date(moveIn) : null,
    durationMonths: num(formData.get("durationMonths")) != null ? Math.round(num(formData.get("durationMonths"))!) : null,
    notes: String(formData.get("notes") ?? "").trim() || null,
    assignedToId: String(formData.get("assignedToId") ?? "").trim() || null,
  };
}

export async function createClient(formData: FormData) {
  const user = await requireUser();
  const data = clientData(formData);
  if (!data.name) return;
  const client = await prisma.client.create({ data: { ...data, assignedToId: data.assignedToId ?? user.id } });
  await logActivity(user.id, "client", null, `ახალი კლიენტი: ${client.name}`);
  revalidatePath("/clients");
  redirect(`/clients/${client.id}`);
}

export async function updateClient(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const data = clientData(formData);
  if (!id || !data.name) return;
  await prisma.client.update({ where: { id }, data });
  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
}

export async function setClientStatus(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["new", "searching", "viewing", "closed_won", "closed_lost"].includes(status)) return;
  await prisma.client.update({ where: { id }, data: { status } });
  await logActivity(user.id, "client_status", null, `${id}: ${status}`);
  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
}

export async function addToShortlist(formData: FormData) {
  await requireUser();
  const clientId = String(formData.get("clientId") ?? "");
  const listingId = String(formData.get("listingId") ?? "");
  if (!clientId || !listingId) return;
  await prisma.shortlist.upsert({ where: { clientId_listingId: { clientId, listingId } }, update: {}, create: { clientId, listingId } });
  revalidatePath(`/clients/${clientId}`);
}

export async function updateShortlist(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!id) return;
  await prisma.shortlist.update({ where: { id }, data: { status: status || undefined, note: note || null } });
  revalidatePath(`/clients/${clientId}`);
}

export async function removeFromShortlist(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  if (!id) return;
  await prisma.shortlist.delete({ where: { id } });
  revalidatePath(`/clients/${clientId}`);
}
