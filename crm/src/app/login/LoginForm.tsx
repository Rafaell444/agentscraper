"use client";

import { useActionState } from "react";
import { login } from "./actions";
import { Button, Input } from "@/components/ui";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-gray-700">ელფოსტა</span>
        <Input name="email" type="email" required autoComplete="username" placeholder="name@example.com" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-gray-700">პაროლი</span>
        <Input name="password" type="password" required autoComplete="current-password" placeholder="••••••••" />
      </label>
      {state?.error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "შესვლა…" : "შესვლა"}
      </Button>
    </form>
  );
}
