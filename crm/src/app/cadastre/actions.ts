"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { addressKey } from "@/lib/cadastre";

/** Save the cadastral code of an address; every listing and banner at the
 * same street + house number shows it from then on.  Empty code removes it. */
export async function setCadastralCode(formData: FormData) {
  const user = await requireUser();
  const address = String(formData.get("address") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const key = addressKey(address);
  if (!key) return;
  if (code) {
    await prisma.cadastralCode.upsert({
      where: { addressKey: key },
      create: { addressKey: key, address, code, updatedBy: user.name },
      update: { code, address, updatedBy: user.name },
    });
  } else {
    await prisma.cadastralCode.deleteMany({ where: { addressKey: key } });
  }
  const back = String(formData.get("back") ?? "");
  if (back.startsWith("/")) revalidatePath(back);
  revalidatePath("/banners");
}
