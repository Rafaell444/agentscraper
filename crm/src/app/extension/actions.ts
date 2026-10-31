"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { newExtToken } from "@/lib/ext";

/** A new personal key for the Chrome extension (the old one stops working). */
export async function rotateExtToken() {
  const user = await requireUser();
  await newExtToken(user.id);
  revalidatePath("/extension");
}
