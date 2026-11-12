"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashPassword, requireMember } from "@/lib/auth";

/** Anyone changes their own password (the current one is asked first). */
export async function changeOwnPassword(formData: FormData) {
  const me = await requireMember();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const again = String(formData.get("again") ?? "");
  const user = await prisma.user.findUnique({ where: { id: me.id }, select: { passwordHash: true } });
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) redirect(`/account?msg=${encodeURIComponent("err:მიმდინარე პაროლი არასწორია.")}`);
  if (next.length < 6) redirect(`/account?msg=${encodeURIComponent("err:ახალი პაროლი მინიმუმ 6 სიმბოლო უნდა იყოს.")}`);
  if (next !== again) redirect(`/account?msg=${encodeURIComponent("err:ახალი პაროლები ერთმანეთს არ ემთხვევა.")}`);
  await prisma.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(next) } });
  redirect(`/account?msg=${encodeURIComponent("ok:პაროლი შეიცვალა.")}`);
}
