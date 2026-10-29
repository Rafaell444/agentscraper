"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { shareBase } from "@/lib/shareUrl";
import { AVAILABILITY, asLang } from "@/lib/catalog";
import { ensureRefNo, publishToChannel, publishWelcome, refreshChannelPost, removeFromChannel } from "@/lib/channel";
import { alertMatchingClients } from "@/lib/clientAlerts";
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

/** Delete from all channels, or from one ("lang" = ru / en). */
export async function takeOffChannel(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const lang = String(formData.get("lang") ?? "");
  back(id, await removeFromChannel(id, lang ? asLang(lang) : undefined));
}

/** Hide from the mini app and delete from every channel. */
export async function takeOffBoth(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.sharedPost.update({ where: { id }, data: { catalog: false } });
  const result = await removeFromChannel(id);
  back(id, { ok: true, message: `🙈 მინი აპიდან დაიმალა. 📣 ${result.ok ? result.message : result.error}` });
}

/** Show a hidden flat in the mini app again (same number); matching clients get the bot alert. */
export async function showInApp(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.sharedPost.update({ where: { id }, data: { catalog: true } });
  await ensureRefNo(id);
  await refreshChannelPost(id);
  const alerted = await alertMatchingClients(id).catch(() => 0);
  back(id, { ok: true, message: `👁 მინი აპში ისევ ჩანს${alerted ? `. 🔔 ${alerted} კლიენტს ეცნობა` : ""}` });
}

/** Hide the flat from the mini app; channel posts stay but lose the app link. */
export async function takeOffApp(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.sharedPost.update({ where: { id }, data: { catalog: false } });
  await refreshChannelPost(id);
  back(id, { ok: true, message: "🙈 მინი აპიდან დაიმალა — „👁 აპში დაბრუნება“ აბრუნებს" });
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
    pin: formData.get("pin") === "1",
    fresh: formData.get("fresh") === "1",
    photo: photo instanceof File ? photo : null,
  });
  revalidatePath("/channel");
  const text = result.ok ? `ok:${result.message}` : `err:${result.error}`;
  redirect(`/channel?welcome=${encodeURIComponent(text)}#welcome`);
}
