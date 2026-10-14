"use server";

import { redirect } from "next/navigation";
import { clearSession, createSession, verifyLogin } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

export async function login(_state: { error?: string } | undefined, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const user = await verifyLogin(email, password);
  if (!user) return { error: "ელფოსტა ან პაროლი არასწორია" };
  await createSession({ id: user.id, email: user.email, name: user.name, role: user.role });
  await logActivity(user.id, "login");
  redirect("/");
}

export async function logout() {
  await clearSession();
  redirect("/login");
}
