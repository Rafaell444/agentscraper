"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { SessionUser } from "@/lib/auth";
import { logout } from "@/app/login/actions";

export function UserMenu({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-gray-200 bg-white py-1 pl-1 pr-3 text-sm shadow-sm hover:bg-gray-50"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">{initials || "A"}</span>
        <span className="hidden max-w-[140px] truncate text-gray-700 lg:inline">{user.name}</span>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400">
          <path d="M6 8l4 4 4-4" />
        </svg>
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 px-4 py-3">
            <div className="text-sm font-semibold text-gray-900">{user.name}</div>
            <div className="truncate text-xs text-gray-500">{user.email}</div>
            <div className="mt-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">{user.role === "admin" ? "ადმინისტრატორი" : "აგენტი"}</div>
          </div>
          <Link href="/agents" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            აგენტები და პაროლი
          </Link>
          <Link href="/followups" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            ჩემი დასარეკი
          </Link>
          <form action={logout} className="border-t border-gray-100">
            <button type="submit" className="block w-full px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50">
              გასვლა
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
