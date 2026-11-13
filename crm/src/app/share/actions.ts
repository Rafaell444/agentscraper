"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember, type SessionUser } from "@/lib/auth";
import { downloadImages, draftFromListing, newToken, replacePhones } from "@/lib/sharedPosts";

// A partner's own posts: shared only into his WhatsApp group through the
// post's private link (/s/<token>).  They never go to the mini app, the
// Telegram channels or the social networks (catalog stays false), and he
// changes only posts he created himself.

function text(formData: FormData, key: string, max = 4000): string | null {
  return String(formData.get(key) ?? "").trim().slice(0, max) || null;
}

function num(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").replace(/\s/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", ".");
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) && Math.abs(value) < 1e10 ? value : null;
}

function int(formData: FormData, key: string): number | null {
  const value = num(formData, key);
  return value == null ? null : Math.round(value);
}

async function ownPost(user: SessionUser, id: string) {
  const post = await prisma.sharedPost.findUnique({ where: { id }, select: { id: true, createdById: true, catalog: true } });
  // Only his own private posts (a staff member's catalog post is never touched here).
  return post && post.createdById === user.id && !post.catalog ? post : null;
}

/** The contact on his posts: the name and number he used last time. */
async function lastContact(user: SessionUser) {
  const last = await prisma.sharedPost.findFirst({ where: { createdById: user.id, contactPhone: { not: null } }, orderBy: { createdAt: "desc" }, select: { contactName: true, contactPhone: true } });
  return { contactName: last?.contactName ?? user.name, contactPhone: last?.contactPhone ?? null };
}

const PRIVATE = { catalog: false, lang: "en", status: "published", scheduleAppAt: null, scheduleTgAt: null } as const;

export async function createMyPost() {
  const user = await requireMember();
  const post = await prisma.sharedPost.create({
    data: { ...PRIVATE, ...(await lastContact(user)), title: "New flat", dealType: "ქირავდება", propertyType: "ბინა", token: newToken(), createdById: user.id },
  });
  redirect(`/share/mine/${post.id}`);
}

/** A post from a scraped listing: its facts and photos, without the owner's number. */
export async function createMyPostFromListing(formData: FormData) {
  const user = await requireMember();
  const listingId = String(formData.get("listingId") ?? "");
  const draft = listingId ? await draftFromListing(listingId) : null;
  if (!draft) return;
  const { imageUrls, ...fields } = draft;
  const contact = await lastContact(user);
  const post = await prisma.sharedPost.create({
    data: {
      ...fields,
      ...PRIVATE,
      ...contact,
      title: replacePhones(fields.title || "Flat"),
      currency: fields.currency ?? "USD",
      description: fields.description ? replacePhones(fields.description, contact.contactPhone ?? "") : null,
      // The source link would show the owner's number: not kept.
      sourceUrl: null,
      token: newToken(),
      createdById: user.id,
    },
  });
  const photos = await downloadImages(imageUrls);
  if (photos.length) {
    await prisma.sharedPostPhoto.createMany({ data: photos.map((photo, position) => ({ postId: post.id, position, mime: photo.mime, data: Buffer.from(photo.data) })) });
  }
  redirect(`/share/mine/${post.id}?from=listing`);
}

export async function updateMyPost(formData: FormData) {
  const user = await requireMember();
  const id = String(formData.get("id") ?? "");
  if (!(await ownPost(user, id))) return;
  await prisma.sharedPost.update({
    where: { id },
    data: {
      ...PRIVATE,
      title: text(formData, "title", 200) ?? "Flat",
      dealType: text(formData, "dealType", 50),
      propertyType: text(formData, "propertyType", 50),
      location: text(formData, "location", 200),
      price: num(formData, "price"),
      currency: formData.get("currency") === "GEL" ? "GEL" : "USD",
      area: num(formData, "area"),
      rooms: int(formData, "rooms"),
      bedrooms: int(formData, "bedrooms"),
      bathrooms: int(formData, "bathrooms"),
      floor: int(formData, "floor"),
      totalFloors: int(formData, "totalFloors"),
      description: text(formData, "description"),
      contactName: text(formData, "contactName", 100),
      contactPhone: text(formData, "contactPhone", 40),
    },
  });
  revalidatePath(`/share/mine/${id}`);
  redirect(`/share/mine/${id}?saved=1`);
}

export async function deleteMyPost(formData: FormData) {
  const user = await requireMember();
  const id = String(formData.get("id") ?? "");
  if (!(await ownPost(user, id))) return;
  await prisma.sharedPost.delete({ where: { id } });
  revalidatePath("/share");
  redirect("/share?kind=mine");
}

export async function deleteMyPhoto(photoId: string) {
  const user = await requireMember();
  const photo = await prisma.sharedPostPhoto.findUnique({ where: { id: photoId }, select: { postId: true } });
  if (!photo || !(await ownPost(user, photo.postId))) return;
  await prisma.sharedPostPhoto.delete({ where: { id: photoId } });
}
