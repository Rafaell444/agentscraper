"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SessionUser } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { UserMenu } from "./UserMenu";
import { ListingsLink } from "./ListingsLink";

const LINKS = [
  { href: "/", label: "დეშბორდი", icon: "M3 13h8V3H3v10zm10 8h8V11h-8v10zM3 21h8v-6H3v6zm10-18v6h8V3h-8z" },
  { href: "/listings", label: "განცხადებები", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/owners", label: "განმთავსებლები", icon: "M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21a8 8 0 0 1 16 0" },
  { href: "/followups", label: "დასარეკი", icon: "M8 2v3M16 2v3M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" },
  { href: "/clients", label: "კლიენტები", icon: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
  { href: "/shared", label: "პოსტები", icon: "M4 4h16v12H5.2L4 17.2V4zM8 9h8M8 12h5" },
  { href: "/viewings", label: "ჩვენებები", icon: "M3 4h18v16H3zM3 10h18M8 2v4M16 2v4" },
  { href: "/segments/indian", label: "სეგმენტები", icon: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM18 18h3v3h-3zM14 18h2M18 14h3" },
  { href: "/market", label: "ბაზარი", icon: "M3 20h18M5 16l4-6 4 3 6-8" },
  { href: "/deals", label: "გარიგებები", icon: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" },
  { href: "/publish", label: "გამოქვეყნება", icon: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" },
  { href: "/agents", label: "აგენტები", icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function Nav({ user, unread = 0 }: { user: SessionUser; unread?: number }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const linkClass = (href: string) =>
    `flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition lg:px-3 ${
      isActive(href) ? "bg-emerald-600 text-white shadow-sm" : "text-gray-600 hover:bg-emerald-50 hover:text-emerald-800"
    }`;

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-3 py-2 sm:px-4">
        <Link href="/" className="flex items-center gap-2 pr-2" onClick={() => setOpen(false)}>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 11l9-8 9 8M5 10v10h14V10" />
            </svg>
          </span>
          <span className="text-base font-bold tracking-tight text-gray-900">მესაკუთრე CRM</span>
        </Link>
        <nav className="hidden flex-1 flex-wrap items-center gap-1 md:flex">
          {LINKS.map((link) =>
            link.href === "/listings" ? (
              <ListingsLink key={link.href} className={linkClass(link.href)}>
                <Icon d={link.icon} />
                {link.label}
              </ListingsLink>
            ) : (
              <Link key={link.href} href={link.href} className={linkClass(link.href)}>
                <Icon d={link.icon} />
                {link.label}
              </Link>
            ),
          )}
        </nav>
        <Link href="/notifications" aria-label="შეტყობინებები" className="relative ml-auto rounded-lg p-2 text-gray-600 hover:bg-gray-100 md:ml-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></svg>
          {unread > 0 ? <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-rose-600 px-1 text-center text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span> : null}
        </Link>
        <div className="hidden md:block">
          <UserMenu user={user} />
        </div>
        <button
          type="button"
          aria-label="მენიუ"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="rounded-lg border border-gray-300 p-2 text-gray-700 md:hidden"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? (
              <>
                <path d="M5 5l10 10" />
                <path d="M15 5L5 15" />
              </>
            ) : (
              <>
                <path d="M3 5h14" />
                <path d="M3 10h14" />
                <path d="M3 15h14" />
              </>
            )}
          </svg>
        </button>
      </div>
      {open ? (
        <div className="border-t border-gray-200 bg-white px-3 py-2 md:hidden">
          <nav className="flex flex-col gap-1">
            {LINKS.map((link) =>
              link.href === "/listings" ? (
                <ListingsLink key={link.href} className={linkClass(link.href)} onClick={() => setOpen(false)}>
                  <Icon d={link.icon} />
                  {link.label}
                </ListingsLink>
              ) : (
                <Link key={link.href} href={link.href} className={linkClass(link.href)} onClick={() => setOpen(false)}>
                  <Icon d={link.icon} />
                  {link.label}
                </Link>
              ),
            )}
          </nav>
          <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 text-sm">
            <span className="text-gray-600">
              {user.name} <span className="text-gray-400">({user.role === "admin" ? "ადმინი" : "აგენტი"})</span>
            </span>
            <form action={logout}>
              <button className="ui-btn ui-btn-secondary ui-btn-sm" type="submit">
                გასვლა
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </header>
  );
}
