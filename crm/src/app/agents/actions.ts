"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { hashPassword, requireAdmin, requireUser } from "@/lib/auth";

export async function createUser(formData: FormData) {
  await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "agent") === "admin" ? "admin" : "agent";
  if (!email || !name || password.length < 6) return;
  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { email },
    update: { name, role, passwordHash, active: true },
    create: { email, name, role, passwordHash },
  });
  revalidatePath("/agents");
}

export async function setUserActive(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "1";
  if (!id || id === admin.id) return;
  await prisma.user.update({ where: { id }, data: { active } });
  revalidatePath("/agents");
}

export async function setTelegram(formData: FormData) {
  const me = await requireUser();
  const id = String(formData.get("id") ?? "");
  const chatId = String(formData.get("telegramChatId") ?? "").trim() || null;
  if (!id || (id !== me.id && me.role !== "admin")) return;
  await prisma.user.update({ where: { id }, data: { telegramChatId: chatId } });
  revalidatePath("/agents");
}

export async function resetPassword(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!id || password.length < 6) return;
  await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password) } });
  revalidatePath("/agents");
}
