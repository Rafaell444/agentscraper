"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { shareBase } from "@/lib/shareUrl";
import { AVAILABILITY } from "@/lib/catalog";
import { publishToChannel, publishWelcome, refreshChannelPost, removeFromChannel } from "@/lib/channel";
import { callVerbose, webhookSecret } from "@/lib/telegram";

function back(id: string, result: { ok: boolean; message?: string; error?: string }): never {
  revalidatePath(`/shared/${id}`);
  revalidatePath("/channel");
  const text = result.ok ? `ok:${result.message ?? ""}` : `err:${result.error ?? ""}`;
  redirect(`/shared/${id}?channel=${encodeURIComponent(text)}#catalog`);
}

export async function postToChannel(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  back(id, await publishToChannel(id));
}

export async function takeOffChannel(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  back(id, await removeFromChannel(id));
}

export async function setAvailability(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const value = String(formData.get("availability") ?? "");
  if (!id || !(value in AVAILABILITY)) return;
  await prisma.sharedPost.update({ where: { id }, data: { availability: value } });
  await refreshChannelPost(id);
  back(id, { ok: true, message: `სტატუსი: ${AVAILABILITY[value].label}` });
}

/** Point the bot at this CRM: webhook for /start and the menu button that opens the mini app. */
export async function connectBot() {
  await requireAdmin();
  const settings = await getSettings();
  const base = await shareBase(settings.public_base_url);
  let result = "ok";
  if (!base.startsWith("https://")) {
    result = "err:მისამართი https-ით უნდა იწყებოდეს (გახსენი CRM Vercel-ის მისამართიდან ან შეავსე public_base_url).";
  } else {
    const hook = await callVerbose("setWebhook", { url: `${base}/api/telegram/webhook`, secret_token: webhookSecret(), allowed_updates: ["message"], drop_pending_updates: false });
    const menu = await callVerbose("setChatMenuButton", { menu_button: { type: "web_app", text: "🏠 Catalog", web_app: { url: `${base}/catalog` } } });
    if (!hook.ok) result = `err:webhook — ${hook.error}`;
    else if (!menu.ok) result = `err:menu — ${menu.error}`;
  }
  revalidatePath("/channel");
  redirect(`/channel?bot=${encodeURIComponent(result)}`);
}

export async function setLeadStatus(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const status = formData.get("status") === "done" ? "done" : "new";
  if (id) await prisma.catalogLead.update({ where: { id }, data: { status } });
  revalidatePath("/channel");
}

/** Bot-sent welcome post with "Open App" buttons, optionally pinned. */
export async function postWelcome(formData: FormData) {
  await requireAdmin();
  const lang = formData.get("lang") === "ru" ? "ru" : "en";
  const photo = formData.get("photo");
  const result = await publishWelcome({
    lang,
    text: String(formData.get("text") ?? ""),
    button: String(formData.get("button") ?? ""),
    mapButton: String(formData.get("mapButton") ?? ""),
    pin: formData.get("pin") === "1",
    fresh: formData.get("fresh") === "1",
    photo: photo instanceof File ? photo : null,
  });
  revalidatePath("/channel");
  const text = result.ok ? `ok:${result.message}` : `err:${result.error}`;
  redirect(`/channel?welcome=${encodeURIComponent(text)}#welcome`);
}
