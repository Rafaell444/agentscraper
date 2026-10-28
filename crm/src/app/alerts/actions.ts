"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { checkConnections, newConnectCode, sendTelegram } from "@/lib/telegram";

function list(formData: FormData, key: string): string {
  return formData.getAll(key).map((v) => String(v).trim()).filter(Boolean).join(",");
}

function num(formData: FormData, key: string): number | null {
  const match = String(formData.get(key) ?? "").replace(/\s/g, "").replace(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function int(formData: FormData, key: string): number | null {
  const value = num(formData, key);
  return value == null ? null : Math.round(value);
}

function ruleData(formData: FormData) {
  const posterKind = String(formData.get("posterKind") ?? "");
  return {
    name: String(formData.get("name") ?? "").trim() || "ფილტრი",
    recipientIds: list(formData, "recipientIds"),
    dealTypes: list(formData, "dealTypes"),
    propertyTypes: list(formData, "propertyTypes"),
    areas: list(formData, "areas"),
    sites: list(formData, "sites"),
    posterKind: posterKind === "owner" || posterKind === "agent" ? posterKind : "",
    priceMin: num(formData, "priceMin"),
    priceMax: num(formData, "priceMax"),
    areaMin: num(formData, "areaMin"),
    areaMax: num(formData, "areaMax"),
    roomsMin: int(formData, "roomsMin"),
    roomsMax: int(formData, "roomsMax"),
    keywords: String(formData.get("keywords") ?? "").split(/[,;]/).map((w) => w.trim()).filter(Boolean).join(","),
  };
}

export async function saveRule(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (id) await prisma.alertRule.update({ where: { id }, data: ruleData(formData) });
  else await prisma.alertRule.create({ data: { ...ruleData(formData), createdById: user.id } });
  revalidatePath("/alerts");
  redirect("/alerts?saved=1");
}

export async function toggleRule(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const rule = await prisma.alertRule.findUnique({ where: { id }, select: { active: true } });
  if (rule) await prisma.alertRule.update({ where: { id }, data: { active: !rule.active } });
  revalidatePath("/alerts");
}

export async function deleteRule(formData: FormData) {
  await requireUser();
  await prisma.alertRule.delete({ where: { id: String(formData.get("id") ?? "") } });
  revalidatePath("/alerts");
}

export async function addRecipient(formData: FormData) {
  await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await prisma.telegramRecipient.create({ data: { name, connectCode: newConnectCode() } });
  revalidatePath("/alerts");
}

export async function deleteRecipient(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  await prisma.telegramRecipient.delete({ where: { id } });
  // Drop it from every rule too.
  const rules = await prisma.alertRule.findMany({ where: { recipientIds: { contains: id } }, select: { id: true, recipientIds: true } });
  for (const rule of rules) {
    await prisma.alertRule.update({ where: { id: rule.id }, data: { recipientIds: rule.recipientIds.split(",").filter((r) => r && r !== id).join(",") } });
  }
  revalidatePath("/alerts");
}

/** "Check" button: link phones that pressed Start in the bot. */
export async function checkRecipients() {
  await requireUser();
  const linked = await checkConnections();
  revalidatePath("/alerts");
  redirect(`/alerts?linked=${linked}`);
}

export async function testRecipient(formData: FormData) {
  await requireUser();
  const recipient = await prisma.telegramRecipient.findUnique({ where: { id: String(formData.get("id") ?? "") } });
  const ok = recipient?.chatId ? await sendTelegram(recipient.chatId, "🔔 სატესტო შეტყობინება CRM-დან. შეტყობინებები მუშაობს.") : false;
  redirect(`/alerts?test=${ok ? "ok" : "fail"}`);
}
