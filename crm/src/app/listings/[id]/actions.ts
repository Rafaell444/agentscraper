"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { STATUS_BY_VALUE, statusLabel } from "@/lib/options";

function revalidate(listingId: string) {
  revalidatePath(`/listings/${listingId}`);
  revalidatePath("/listings");
  revalidatePath("/followups");
  revalidatePath("/");
}

export async function updateLead(formData: FormData) {
  const user = await requireUser();
  const listingId = String(formData.get("listingId") ?? "");
  const status = String(formData.get("status") ?? "new");
  const assignedToId = String(formData.get("assignedToId") ?? "") || null;
  const followUpRaw = String(formData.get("followUpAt") ?? "");
  const followUpAt = followUpRaw ? new Date(followUpRaw) : null;
  const priority = Number(formData.get("priority") ?? 0) || 0;
  if (!listingId || !STATUS_BY_VALUE[status]) return;

  const previous = await prisma.lead.findUnique({ where: { listingId } });
  await prisma.lead.upsert({
    where: { listingId },
    update: { status, assignedToId, followUpAt, priority },
    create: { listingId, status, assignedToId, followUpAt, priority },
  });
  if (!previous || previous.status !== status) {
    await logActivity(user.id, "status", listingId, `${statusLabel(previous?.status)} → ${statusLabel(status)}`);
  }
  if ((previous?.assignedToId ?? null) !== assignedToId) {
    const assignee = assignedToId ? await prisma.user.findUnique({ where: { id: assignedToId }, select: { name: true } }) : null;
    await logActivity(user.id, "assign", listingId, assignee?.name ?? "—");
  }
  revalidate(listingId);
}

export async function setStatus(formData: FormData) {
  const user = await requireUser();
  const listingId = String(formData.get("listingId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!listingId || !STATUS_BY_VALUE[status]) return;
  const previous = await prisma.lead.findUnique({ where: { listingId } });
  await prisma.lead.upsert({ where: { listingId }, update: { status }, create: { listingId, status } });
  if (previous?.status !== status) {
    await logActivity(user.id, "status", listingId, `${statusLabel(previous?.status)} → ${statusLabel(status)}`);
  }
  revalidate(listingId);
}

export async function setFollowUp(formData: FormData) {
  const user = await requireUser();
  const listingId = String(formData.get("listingId") ?? "");
  const days = Number(formData.get("days") ?? "");
  if (!listingId || !Number.isFinite(days)) return;
  let followUpAt: Date | null = null;
  if (days >= 0) {
    followUpAt = new Date();
    followUpAt.setDate(followUpAt.getDate() + days);
    followUpAt.setHours(10, 0, 0, 0);
  }
  await prisma.lead.upsert({
    where: { listingId },
    update: { followUpAt, assignedToId: followUpAt ? user.id : undefined },
    create: { listingId, followUpAt, assignedToId: followUpAt ? user.id : null },
  });
  await logActivity(user.id, "followup", listingId, followUpAt ? followUpAt.toISOString().slice(0, 10) : "გაუქმდა");
  revalidate(listingId);
}

export async function setManualPhone(formData: FormData) {
  const user = await requireUser();
  const listingId = String(formData.get("listingId") ?? "");
  const phone = String(formData.get("manualPhone") ?? "").replace(/[^\d+;]/g, "").trim();
  if (!listingId) return;
  await prisma.lead.upsert({
    where: { listingId },
    update: { manualPhone: phone || null },
    create: { listingId, manualPhone: phone || null },
  });
  await logActivity(user.id, "phone", listingId, phone || "წაიშალა");
  revalidate(listingId);
}

export async function setReposted(formData: FormData) {
  const user = await requireUser();
  const listingId = String(formData.get("listingId") ?? "");
  const repostedId = String(formData.get("repostedId") ?? "").trim();
  if (!listingId) return;
  await prisma.lead.upsert({
    where: { listingId },
    update: { repostedId: repostedId || null, repostedById: repostedId ? user.id : null, repostedAt: repostedId ? new Date() : null },
    create: { listingId, repostedId: repostedId || null, repostedById: repostedId ? user.id : null, repostedAt: repostedId ? new Date() : null },
  });
  await logActivity(user.id, "repost", listingId, repostedId || "წაიშალა");
  revalidate(listingId);
}

export async function setHidden(formData: FormData) {
  const user = await requireUser();
  const listingId = String(formData.get("listingId") ?? "");
  const hidden = String(formData.get("hidden") ?? "") === "1";
  if (!listingId) return;
  await prisma.lead.upsert({ where: { listingId }, update: { hidden }, create: { listingId, hidden } });
  await logActivity(user.id, "hidden", listingId, hidden ? "დამალულია საჯარო გვერდიდან" : "ჩანს საჯარო გვერდზე");
  revalidate(listingId);
  revalidatePath("/p", "layout");
}

export async function queuePublication(formData: FormData) {
  const user = await requireUser();
  const listingId = String(formData.get("listingId") ?? "");
  const channels = formData.getAll("channel").map(String).filter((c) => ["telegram", "facebook", "website"].includes(c));
  const text = String(formData.get("text") ?? "").trim();
  const contactPhone = String(formData.get("contactPhone") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();
  if (!listingId || !channels.length || !text) return;
  for (const channel of channels) {
    await prisma.publication.create({
      data: {
        listingId,
        channel,
        target: channel === "website" ? website || null : null,
        text,
        contactPhone: contactPhone || null,
        createdById: user.id,
        status: "queued",
      },
    });
  }
  await logActivity(user.id, "publish", listingId, channels.join(", "));
  revalidate(listingId);
  revalidatePath("/publish");
}

export async function addNote(formData: FormData) {
  const user = await requireUser();
  const listingId = String(formData.get("listingId") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  if (!listingId || !text) return;
  await prisma.note.create({ data: { listingId, userId: user.id, text } });
  await prisma.lead.upsert({ where: { listingId }, update: {}, create: { listingId } });
  await logActivity(user.id, "note", listingId, text.slice(0, 120));
  revalidate(listingId);
}

export async function logCall(formData: FormData) {
  const user = await requireUser();
  const listingId = String(formData.get("listingId") ?? "");
  if (!listingId) return;
  const lead = await prisma.lead.upsert({
    where: { listingId },
    update: {},
    create: { listingId, status: "called" },
  });
  if (lead.status === "new") await prisma.lead.update({ where: { listingId }, data: { status: "called" } });
  await logActivity(user.id, "call", listingId);
  revalidate(listingId);
}
