"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { phoneDigits } from "@/lib/phones";

function text(formData: FormData, key: string): string | null {
  return String(formData.get(key) ?? "").trim() || null;
}

function num(formData: FormData, key: string): number | null {
  const match = String(formData.get(key) ?? "").replace(/\s/g, "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function bannerData(formData: FormData) {
  const phone = text(formData, "phone");
  return {
    address: text(formData, "address") ?? "",
    district: text(formData, "district"),
    dealType: text(formData, "dealType"),
    propertyType: text(formData, "propertyType"),
    phone,
    phoneDigits: phoneDigits(phone) || null,
    ownerName: text(formData, "ownerName"),
    price: num(formData, "price"),
    comment: text(formData, "comment"),
    lat: num(formData, "lat"),
    lng: num(formData, "lng"),
  };
}

/** Called from the banner form; the form then uploads the photos to the new id. */
export async function createBanner(formData: FormData): Promise<{ id: string } | { error: string }> {
  const user = await requireUser();
  const data = bannerData(formData);
  if (!data.address && !data.phone) return { error: "ჩაწერე მისამართი ან ტელეფონი" };
  const banner = await prisma.streetBanner.create({ data: { ...data, createdById: user.id } });
  await logActivity(user.id, "banner", null, `ქუჩის ბანერი: ${data.address || data.phone}`);
  revalidatePath("/banners");
  return { id: banner.id };
}

export async function updateBanner(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.streetBanner.update({ where: { id }, data: bannerData(formData) });
  revalidatePath(`/banners/${id}`);
  revalidatePath("/banners");
  redirect(`/banners/${id}?saved=1`);
}

export async function setBannerStatus(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["new", "called", "interested", "listed", "rejected"].includes(status)) return;
  await prisma.streetBanner.update({ where: { id }, data: { status } });
  revalidatePath(`/banners/${id}`);
  revalidatePath("/banners");
}

export async function deleteBanner(formData: FormData) {
  await requireUser();
  await prisma.streetBanner.delete({ where: { id: String(formData.get("id") ?? "") } });
  revalidatePath("/banners");
  redirect("/banners");
}

export async function deleteBannerPhoto(formData: FormData) {
  await requireUser();
  const photo = await prisma.bannerPhoto.delete({ where: { id: String(formData.get("id") ?? "") }, select: { bannerId: true } });
  revalidatePath(`/banners/${photo.bannerId}`);
}
