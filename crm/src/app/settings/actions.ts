"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { SETTING_KEYS } from "@/lib/settings";

export async function saveSettings(formData: FormData) {
  await requireAdmin();
  for (const { key } of SETTING_KEYS) {
    const value = String(formData.get(key) ?? "").trim();
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  revalidatePath("/settings");
  revalidatePath("/publish");
  revalidatePath("/p", "layout");
}
