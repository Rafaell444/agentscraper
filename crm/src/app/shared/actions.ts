"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { getSettings } from "@/lib/settings";
import { ensureRefNo, publishToChannel, refreshChannelPost } from "@/lib/channel";
import { defaultContact, downloadImages, draftFromListing, draftFromUrl, newToken, parseMapInput, replacePhones, requestCollectorFetch, type PostDraft } from "@/lib/sharedPosts";

function text(formData: FormData, key: string): string | null {
  return String(formData.get(key) ?? "").trim() || null;
}

/** Lenient number: "1 200", "1,200", "50.5 მ²", "$450" all work; junk becomes empty. */
function num(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").replace(/\s/g, "");
  const match = raw.replace(/,(?=\d{3}\b)/g, "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) && Math.abs(value) < 1e12 ? value : null;
}

function int(formData: FormData, key: string): number | null {
  const value = num(formData, key);
  return value == null || Math.abs(value) > 2_000_000_000 ? null : Math.round(value);
}

async function createFromDraft(userId: string, draft: PostDraft, extra: { sourceUrl?: string | null; clientId?: string | null }) {
  const settings = await getSettings();
  const contact = await defaultContact(userId, settings.agency_phone);
  const { imageUrls, ...fields } = draft;
  const post = await prisma.sharedPost.create({
    data: {
      ...fields,
      title: fields.title || "ახალი განცხადება",
      currency: fields.currency ?? "USD",
      // The owner's numbers in the text become the agent's number.
      description: fields.description ? replacePhones(fields.description, contact.phone ?? "") : null,
      token: newToken(),
      sourceUrl: extra.sourceUrl ?? null,
      clientId: extra.clientId ?? null,
      contactName: contact.name,
      contactPhone: contact.phone,
      createdById: userId,
    },
  });
  const photos = await downloadImages(imageUrls);
  if (photos.length) {
    await prisma.sharedPostPhoto.createMany({
      data: photos.map((photo, position) => ({ postId: post.id, position, mime: photo.mime, data: Buffer.from(photo.data) })),
    });
  }
  return post;
}

/** Paste a link from myhome.ge / binebi.ge / ss.ge ... and get an editable draft. */
export async function importPost(formData: FormData) {
  const user = await requireUser();
  const url = text(formData, "url");
  const clientId = text(formData, "clientId");
  const result: { draft: PostDraft; found: boolean; sourceUrl: string | null; needsCollector: boolean } = url
    ? await draftFromUrl(url)
    : { draft: { title: "", imageUrls: [] }, found: false, sourceUrl: null, needsCollector: false };
  const post = await createFromDraft(user.id, result.draft, { sourceUrl: result.sourceUrl, clientId });
  // MyHome pages are fetched by the collector (~1 minute); the editor fills
  // the post in when the listing lands in the database.
  const waiting = result.needsCollector && result.sourceUrl ? await requestCollectorFetch(result.sourceUrl) : false;
  if (waiting) await prisma.sharedPost.update({ where: { id: post.id }, data: { importState: "waiting", importRequestedAt: new Date() } });
  await logActivity(user.id, "shared_post", result.draft.listingId ?? null, `პოსტი შეიქმნა: ${post.title}`);
  revalidatePath("/shared");
  redirect(`/shared/${post.id}${url && !result.found && !waiting ? "?notfound=1" : ""}`);
}

export async function createPostFromListing(formData: FormData) {
  const user = await requireUser();
  const listingId = String(formData.get("listingId") ?? "");
  const draft = await draftFromListing(listingId);
  if (!draft) return;
  const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: { link: true } });
  const post = await createFromDraft(user.id, draft, { sourceUrl: listing?.link ?? null, clientId: text(formData, "clientId") });
  await logActivity(user.id, "shared_post", listingId, `პოსტი შეიქმნა: ${post.title}`);
  revalidatePath("/shared");
  redirect(`/shared/${post.id}`);
}

export async function updatePost(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const lang = String(formData.get("lang") ?? "ka");
  // Set by savePostAndPublish (the submit button's own name/value does not
  // reach form actions reliably).
  const publish = formData.get("publish") === "1";
  // Set by the "mini app" / "Telegram" / "both" buttons; plain save publishes nowhere.
  const target = String(formData.get("target") ?? "");
  const clientId = text(formData, "clientId");
  const clientExists = clientId ? await prisma.client.count({ where: { id: clientId } }) : 0;
  // Map: a Google Maps / OSM link or "lat, lng"; empty clears it; unreadable keeps the old point.
  const mapInput = String(formData.get("mapInput") ?? "").trim();
  const coords = mapInput ? await parseMapInput(mapInput) : null;
  const mapBad = Boolean(mapInput && !coords);
  const mapModeRaw = String(formData.get("mapMode") ?? "approx");
  await prisma.sharedPost.update({
    where: { id },
    data: {
      ...(publish ? { status: "published" } : {}),
      title: text(formData, "title") ?? "განცხადება",
      dealType: text(formData, "dealType"),
      propertyType: text(formData, "propertyType"),
      location: text(formData, "location"),
      price: num(formData, "price"),
      currency: formData.get("currency") === "GEL" ? "GEL" : "USD",
      area: num(formData, "area"),
      rooms: int(formData, "rooms"),
      bedrooms: int(formData, "bedrooms"),
      bathrooms: int(formData, "bathrooms"),
      floor: int(formData, "floor"),
      totalFloors: int(formData, "totalFloors"),
      condition: text(formData, "condition"),
      description: text(formData, "description"),
      contactName: text(formData, "contactName"),
      contactPhone: text(formData, "contactPhone"),
      clientId: clientExists ? clientId : null,
      lang: ["ka", "en", "ru"].includes(lang) ? lang : "ka",
      mapMode: ["exact", "approx", "off"].includes(mapModeRaw) ? mapModeRaw : "approx",
      ...(mapBad ? {} : { lat: coords?.lat ?? null, lng: coords?.lng ?? null }),
      // Catalog details (mini app + channel)
      district: text(formData, "district"),
      features: formData.getAll("features").map(String).filter(Boolean).join(","),
      pets: ["yes", "no", "ask"].includes(String(formData.get("pets"))) ? String(formData.get("pets")) : null,
      leaseTerm: text(formData, "leaseTerm"),
      descriptionEn: text(formData, "descriptionEn"),
      descriptionRu: text(formData, "descriptionRu"),
    },
  });
  const notes: string[] = [];
  let failed = false;
  if (target === "app" || target === "both") {
    await prisma.sharedPost.update({ where: { id }, data: { catalog: true } });
    await ensureRefNo(id);
    notes.push("📱 მინი აპში დაემატა");
  }
  if (target === "tg" || target === "both") {
    const result = await publishToChannel(id);
    notes.push(result.ok ? result.message : result.error);
    failed = !result.ok;
  } else {
    await refreshChannelPost(id);
  }
  revalidatePath(`/shared/${id}`);
  revalidatePath("/shared");
  revalidatePath("/channel");
  const channel = notes.length ? `&channel=${encodeURIComponent(`${failed ? "err" : "ok"}:${notes.join(". ")}`)}#catalog` : "";
  redirect(`/shared/${id}?saved=${publish ? "published" : "1"}${mapBad ? "&map=bad" : ""}${channel}`);
}

/** Ask the collector again for a MyHome post whose fetch failed. */
export async function retryCollectorFetch(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const post = id ? await prisma.sharedPost.findUnique({ where: { id }, select: { sourceUrl: true } }) : null;
  if (!post?.sourceUrl) return;
  const ok = await requestCollectorFetch(post.sourceUrl);
  await prisma.sharedPost.update({ where: { id }, data: ok ? { importState: "waiting", importRequestedAt: new Date() } : { importState: "failed" } });
  revalidatePath(`/shared/${id}`);
}

/** Save, then show the flat in the mini app, post it to the Telegram channels, or both. */
export async function saveToApp(formData: FormData) {
  formData.set("target", "app");
  await updatePost(formData);
}

export async function saveToTelegram(formData: FormData) {
  formData.set("target", "tg");
  await updatePost(formData);
}

export async function saveToBoth(formData: FormData) {
  formData.set("target", "both");
  await updatePost(formData);
}

/** "Save and publish" button: same form, then the post goes live. */
export async function savePostAndPublish(formData: FormData) {
  formData.set("publish", "1");
  await updatePost(formData);
}

export async function setPostStatus(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["draft", "published", "archived"].includes(status)) return;
  const post = await prisma.sharedPost.update({ where: { id }, data: { status } });
  await logActivity(user.id, "shared_post", post.listingId, `პოსტი: ${post.title} → ${status}`);
  revalidatePath(`/shared/${id}`);
  revalidatePath("/shared");
}

/** A new secret link: the old one stops working at once. */
export async function regenerateToken(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.sharedPost.update({ where: { id }, data: { token: newToken() } });
  revalidatePath(`/shared/${id}`);
  revalidatePath("/shared");
}

export async function deletePost(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.sharedPost.delete({ where: { id } });
  revalidatePath("/shared");
  redirect("/shared");
}

export async function deletePhoto(photoId: string) {
  await requireUser();
  const photo = await prisma.sharedPostPhoto.delete({ where: { id: photoId }, select: { postId: true } });
  revalidatePath(`/shared/${photo.postId}`);
}

/** Move a photo one place left (-1) or right (+1); position 0 is the cover. */
export async function movePhoto(photoId: string, direction: -1 | 1) {
  await requireUser();
  const photo = await prisma.sharedPostPhoto.findUnique({ where: { id: photoId }, select: { postId: true } });
  if (!photo) return;
  const photos = await prisma.sharedPostPhoto.findMany({ where: { postId: photo.postId }, orderBy: [{ position: "asc" }, { id: "asc" }], select: { id: true } });
  const ids = photos.map((p) => p.id);
  const from = ids.indexOf(photoId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  await prisma.$transaction(ids.map((id, position) => prisma.sharedPostPhoto.update({ where: { id }, data: { position } })));
  revalidatePath(`/shared/${photo.postId}`);
}
