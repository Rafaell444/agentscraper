"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/auth";
import { disableDbCron, enableDbCron } from "@/lib/dbCron";
import { getSettings } from "@/lib/settings";
import { shareBase } from "@/lib/shareUrl";
import { AVAILABILITY, asLang } from "@/lib/catalog";
import { ensureRefNo, publishToChannel, publishWelcome, refreshChannelPost, removeFromChannel } from "@/lib/channel";
import { alertMatchingClients } from "@/lib/clientAlerts";
import { queueNearby } from "@/lib/nearby";
import { callVerbose, webhookSecret } from "@/lib/telegram";
import { tiktokAuthUrl } from "@/lib/social";
import { randomBytes } from "node:crypto";

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
  queueNearby(id);
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
  // Rented / sold: keep the flat in the app with a label for 30 days (closedAt), counted from the first change.
  const before = await prisma.sharedPost.findUnique({ where: { id }, select: { availability: true, closedAt: true } });
  const closed = value === "rented" || value === "sold";
  const closedAt = closed ? (before?.closedAt && (before.availability === "rented" || before.availability === "sold") ? before.closedAt : new Date()) : null;
  await prisma.sharedPost.update({ where: { id }, data: { availability: value, closedAt } });
  await refreshChannelPost(id);
  back(id, { ok: true, message: `სტატუსი: ${AVAILABILITY[value].label}` });
}

/** "✓ Checked by our agent": an agent saw the flat today (or the mark is removed). */
export async function setVerified(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const on = formData.get("on") === "1";
  await prisma.sharedPost.update({ where: { id }, data: { verifiedAt: on ? new Date() : null } });
  back(id, { ok: true, message: on ? "✓ მონიშნულია: აგენტმა ნახა ბინა (აპში ჩანს „შემოწმებულია“)" : "შემოწმების ნიშანი მოიხსნა" });
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

/** "Connect TikTok": TikTok asks the admin to allow posting, then sends them back to /api/social/tiktok. */
export async function connectTikTokStart() {
  await requireAdmin();
  const state = randomBytes(16).toString("hex");
  await prisma.setting.upsert({ where: { key: "tiktok_oauth_state" }, create: { key: "tiktok_oauth_state", value: state }, update: { value: state } });
  redirect(tiktokAuthUrl(await shareBase((await getSettings()).public_base_url), state));
}

/**
 * The manager changed: "@old" (and t.me/old) becomes "@new" in the settings,
 * the welcome texts and every flat's descriptions; the Telegram channel
 * posts already out are edited to match.
 */
export async function replaceUsername(formData: FormData) {
  await requireAdmin();
  const clean = (v: FormDataEntryValue | null) => String(v ?? "").trim().replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, "");
  const from = clean(formData.get("from"));
  const to = clean(formData.get("to"));
  if (!/^[A-Za-z0-9_]{4,}$/.test(from) || !/^[A-Za-z0-9_]{4,}$/.test(to) || from.toLowerCase() === to.toLowerCase()) {
    redirect(`/channel?rename=${encodeURIComponent("err:ჩაწერე ძველი და ახალი username (მაგ. @old_name → @new_name).")}#rename`);
  }
  const pattern = new RegExp(`(@|t\\.me/)${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_])`, "gi");
  const swap = (text: string | null) => (text ? text.replace(pattern, (_, lead: string) => `${lead}${to}`) : text);

  let settingsChanged = 0;
  for (const row of await prisma.setting.findMany()) {
    const next = swap(row.value);
    if (next !== row.value) {
      await prisma.setting.update({ where: { key: row.key }, data: { value: next ?? "" } });
      settingsChanged++;
    }
  }
  // The manager setting may hold the bare name ("old_name"), without @.
  const manager = await prisma.setting.findUnique({ where: { key: "catalog_manager" } });
  if (manager && manager.value.replace(/^@/, "").toLowerCase() === from.toLowerCase()) {
    await prisma.setting.update({ where: { key: "catalog_manager" }, data: { value: `@${to}` } });
    settingsChanged++;
  }

  // Every flat is checked (a few hundred rows): the username may be in any of the three descriptions.
  const posts = await prisma.sharedPost.findMany({ select: { id: true, description: true, descriptionEn: true, descriptionRu: true, channelMessageIds: true } });
  let postsChanged = 0;
  let channelEdited = 0;
  for (const post of posts) {
    const data = { description: swap(post.description) ?? "", descriptionEn: swap(post.descriptionEn), descriptionRu: swap(post.descriptionRu) };
    const changed = data.description !== (post.description ?? "") || data.descriptionEn !== post.descriptionEn || data.descriptionRu !== post.descriptionRu;
    if (changed) {
      await prisma.sharedPost.update({ where: { id: post.id }, data });
      postsChanged++;
    }
    // Captions carry the manager link too, so every post in the channels is refreshed.
    if (post.channelMessageIds) {
      const result = await publishToChannel(post.id, true).catch(() => null);
      if (result?.ok) channelEdited++;
    }
  }
  revalidatePath("/channel");
  redirect(`/channel?rename=${encodeURIComponent(`ok:@${from} → @${to}: პარამეტრები ${settingsChanged}, ბინის აღწერა ${postsChanged}, არხის პოსტი განახლდა ${channelEdited}. მისასალმებელი პოსტი ხელახლა გამოაქვეყნე (ქვემოთ), რომ არხშიც შეიცვალოს.`)}#rename`);
}

/** Stop one client's "new flat" alerts for one request (the client can also send /stop). */
export async function stopLeadAlerts(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (id) await prisma.catalogLead.update({ where: { id }, data: { alerts: false } });
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

/** Let the database (Supabase pg_cron) call the publisher every 10 minutes. */
export async function enableScheduler() {
  await requireAdmin();
  const settings = await getSettings();
  const base = await shareBase(settings.public_base_url);
  const result = await enableDbCron(base);
  revalidatePath("/channel");
  redirect(`/channel?scheduler=${encodeURIComponent(result.ok ? "ok:ჩართულია: ბაზა ყოველ 10 წუთში გამოაქვეყნებს დაგეგმილ პოსტებს." : `err:${result.error}`)}#scheduler`);
}

export async function disableScheduler() {
  await requireAdmin();
  await disableDbCron();
  revalidatePath("/channel");
  redirect(`/channel?scheduler=${encodeURIComponent("ok:ბაზის ტაიმერი გამოირთო.")}#scheduler`);
}
