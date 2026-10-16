"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function setPublicationStatus(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["queued", "posted", "cancelled"].includes(status)) return;
  await prisma.publication.update({
    where: { id },
    data: { status, error: null, postedAt: status === "posted" ? new Date() : undefined },
  });
  revalidatePath("/publish");
}

export async function deletePublication(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.publication.delete({ where: { id } });
  revalidatePath("/publish");
}
