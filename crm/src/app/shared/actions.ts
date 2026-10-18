"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { getSettings } from "@/lib/settings";
import { defaultContact, downloadImages, draftFromListing, draftFromUrl, newToken, replacePhones, type PostDraft } from "@/lib/sharedPosts";

function text(formData: FormData, key: string): string | null {
  return String(formData.get(key) ?? "").trim() || null;
}

function num(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").replace(/\s/g, "").replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function int(formData: FormData, key: string): number | null {
  const value = num(formData, key);
  return value == null ? null : Math.round(value);
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
  const result: { draft: PostDraft; found: boolean; sourceUrl: string | null } = url
    ? await draftFromUrl(url)
    : { draft: { title: "", imageUrls: [] }, found: false, sourceUrl: null };
  const post = await createFromDraft(user.id, result.draft, { sourceUrl: result.sourceUrl, clientId });
  await logActivity(user.id, "shared_post", result.draft.listingId ?? null, `პოსტი შეიქმნა: ${post.title}`);
  revalidatePath("/shared");
  redirect(`/shared/${post.id}${url && !result.found ? "?notfound=1" : ""}`);
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
  await prisma.sharedPost.update({
    where: { id },
    data: {
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
      clientId: text(formData, "clientId"),
      lang: ["ka", "en", "ru"].includes(lang) ? lang : "ka",
    },
  });
  // "Save and publish" submits the same form with publish=1.
  if (formData.get("publish") === "1") await prisma.sharedPost.update({ where: { id }, data: { status: "published" } });
  revalidatePath(`/shared/${id}`);
  revalidatePath("/shared");
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
