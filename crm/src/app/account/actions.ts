"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashPassword, isPartner, requireMember } from "@/lib/auth";

/** Anyone changes their own password (the current one is asked first). */
export async function changeOwnPassword(formData: FormData) {
  const me = await requireMember();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const again = String(formData.get("again") ?? "");
  const en = isPartner(me);
  const back = (kind: "ok" | "err", ka: string, english: string) => redirect(`/account?msg=${encodeURIComponent(`${kind}:${en ? english : ka}`)}`);
  const user = await prisma.user.findUnique({ where: { id: me.id }, select: { passwordHash: true } });
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) back("err", "მიმდინარე პაროლი არასწორია.", "The current password is wrong.");
  if (next.length < 6) back("err", "ახალი პაროლი მინიმუმ 6 სიმბოლო უნდა იყოს.", "The new password needs at least 6 characters.");
  if (next !== again) back("err", "ახალი პაროლები ერთმანეთს არ ემთხვევა.", "The new passwords do not match.");
  await prisma.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(next) } });
  back("ok", "პაროლი შეიცვალა.", "Password changed.");
}
