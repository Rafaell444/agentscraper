"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { isPartner, requireMember, requireUser, type SessionUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { collectorFetches, listingForUrl, parseSourceUrl, requestCollectorFetch } from "@/lib/sharedPosts";

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
    occupants: num(formData.get("occupants")) != null ? Math.round(num(formData.get("occupants"))!) : null,
    pets: ["yes", "no"].includes(String(formData.get("pets"))) ? String(formData.get("pets")) : null,
    interests: String(formData.get("interests") ?? "").trim().slice(0, 2000) || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
    assignedToId: String(formData.get("assignedToId") ?? "").trim() || null,
  };
}

/** A partner may touch only clients of his segment; others any client. */
async function canEditClient(user: SessionUser, id: string): Promise<boolean> {
  if (!isPartner(user)) return true;
  const client = await prisma.client.findUnique({ where: { id }, select: { segment: true } });
  return Boolean(client && client.segment === user.segment);
}

/** A partner's clients are always in his segment and assigned to him. */
function scoped(user: SessionUser, data: ReturnType<typeof clientData>) {
  return isPartner(user) ? { ...data, segment: user.segment ?? "indian", assignedToId: user.id } : data;
}

export async function createClient(formData: FormData) {
  const user = await requireMember();
  const data = scoped(user, clientData(formData));
  if (!data.name) return;
  const client = await prisma.client.create({ data: { ...data, assignedToId: data.assignedToId ?? user.id } });
  await logActivity(user.id, "client", null, `ახალი კლიენტი: ${client.name}`);
  revalidatePath("/clients");
  redirect(`/clients/${client.id}`);
}

export async function updateClient(formData: FormData) {
  const user = await requireMember();
  const id = String(formData.get("id") ?? "");
  const data = scoped(user, clientData(formData));
  if (!id || !data.name || !(await canEditClient(user, id))) return;
  await prisma.client.update({ where: { id }, data });
  await logActivity(user.id, "client_edit", null, `კლიენტის მონაცემები შეიცვალა: ${data.name}`);
  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
}

export async function setClientStatus(formData: FormData) {
  const user = await requireMember();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["new", "searching", "viewing", "closed_won", "closed_lost"].includes(status)) return;
  if (!(await canEditClient(user, id))) return;
  const client = await prisma.client.update({ where: { id }, data: { status }, select: { name: true } });
  const label: Record<string, string> = { new: "ახალი", searching: "ვეძებთ", viewing: "დათვალიერება", closed_won: "დაქირავდა / იყიდა", closed_lost: "დაიკარგა" };
  await logActivity(user.id, "client_status", null, `${client.name}: ${label[status] ?? status}`);
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

/** Links to flats the client liked (one per line); each is matched to our scraped listing. */
export async function addClientLinks(formData: FormData) {
  const user = await requireMember();
  const clientId = String(formData.get("clientId") ?? "");
  if (!clientId || !(await canEditClient(user, clientId))) return;
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;
  const urls = String(formData.get("urls") ?? "").match(/https?:\/\/\S+/g) ?? [];
  for (const raw of Array.from(new Set(urls)).slice(0, 20)) {
    const url = raw.replace(/[),.;]+$/, "").slice(0, 600);
    const listing = await listingForUrl(url).catch(() => null);
    const parsed = parseSourceUrl(url);
    // Not collected yet: MyHome pages are fetched by the collector (about a minute).
    const fetchAsked = !listing && parsed && collectorFetches(parsed) ? await requestCollectorFetch(url) : false;
    await prisma.clientLink.create({ data: { clientId, url, listingId: listing?.id ?? null, note, fetchAsked, createdById: user.id } });
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
    await logActivity(user.id, "client_link", listing?.id ?? null, `${client?.name ?? ""} — მოწონებული ბინა: ${url}${listing ? " (ბაზაშია)" : ""}`);
  }
  revalidatePath(`/clients/${clientId}`);
}

export async function removeClientLink(formData: FormData) {
  const user = await requireMember();
  const id = String(formData.get("id") ?? "");
  const link = id ? await prisma.clientLink.findUnique({ where: { id }, select: { clientId: true } }) : null;
  if (!link || !(await canEditClient(user, link.clientId))) return;
  await prisma.clientLink.delete({ where: { id } });
  revalidatePath(`/clients/${link.clientId}`);
}
