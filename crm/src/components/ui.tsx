import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { statusColor, statusLabel } from "@/lib/options";

export function Card({ title, children, className = "", action }: { title?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={`ui-card p-4 ${className}`}>
      {title || action ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title ? <h2 className="text-sm font-semibold text-gray-800">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

const ACCENTS: Record<string, string> = {
  emerald: "from-emerald-500 to-emerald-400",
  blue: "from-blue-500 to-sky-400",
  amber: "from-amber-500 to-orange-400",
  rose: "from-rose-500 to-pink-400",
  violet: "from-violet-500 to-fuchsia-400",
  slate: "from-slate-500 to-gray-400",
};

export function StatCard({
  label,
  value,
  hint,
  href,
  accent = "emerald",
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  accent?: keyof typeof ACCENTS | string;
}) {
  const body = (
    <div className="ui-card relative h-full overflow-hidden p-4 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${ACCENTS[accent] ?? ACCENTS.emerald}`} />
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums text-gray-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-gray-500">{hint}</div> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(status)}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {statusLabel(status)}
    </span>
  );
}

const SITE_STYLES: Record<string, string> = {
  myhome: "bg-emerald-100 text-emerald-800",
  ssge: "bg-blue-100 text-blue-800",
  binebi: "bg-amber-100 text-amber-800",
  place: "bg-violet-100 text-violet-800",
  housing: "bg-pink-100 text-pink-800",
  makler: "bg-slate-200 text-slate-700",
  rentals: "bg-cyan-100 text-cyan-800",
  korter: "bg-lime-100 text-lime-800",
  avezor: "bg-orange-100 text-orange-800",
};

export function SiteBadge({ site, name }: { site: string; name: string }) {
  return <span className={`inline-block whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${SITE_STYLES[site] ?? "bg-gray-100 text-gray-700"}`}>{name}</span>;
}

export function PosterBadge({ kind, ownerType }: { kind: string | null | undefined; ownerType?: string | null }) {
  if (kind === "owner") return <span className="inline-block whitespace-nowrap rounded-md bg-emerald-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">მესაკუთრე</span>;
  if (kind === "agent") return <span className="inline-block whitespace-nowrap rounded-md bg-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">{ownerType || "აგენტი"}</span>;
  return <span className="inline-block whitespace-nowrap rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">?</span>;
}

export function Tabs({ items, current, hrefFor }: { items: { value: string; label: string; count?: number }[]; current: string; hrefFor: (value: string) => string }) {
  return (
    <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
      {items.map((item) => (
        <Link
          key={item.value}
          href={hrefFor(item.value)}
          scroll={false}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
            current === item.value ? "bg-emerald-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          {item.label}
          {item.count != null ? <span className={`ml-1.5 text-xs ${current === item.value ? "text-emerald-100" : "text-gray-400"}`}>{item.count}</span> : null}
        </Link>
      ))}
    </div>
  );
}

export function Select({ className = "", active, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { active?: boolean }) {
  return <select {...props} className={`ui-select ${active ? "is-active" : ""} ${className}`} />;
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`ui-field ${className}`} />;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" };

export function Button({ className = "", variant = "primary", size = "md", ...props }: ButtonProps) {
  return <button {...props} className={`ui-btn ui-btn-${variant} ${size === "sm" ? "ui-btn-sm" : ""} ${className}`} />;
}

export function LinkButton({
  href,
  children,
  variant = "secondary",
  size = "md",
  className = "",
  external = false,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  className?: string;
  external?: boolean;
}) {
  const cls = `ui-btn ui-btn-${variant} ${size === "sm" ? "ui-btn-sm" : ""} ${className}`;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

export function Chip({ href, active, children }: { href: string; active?: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`ui-chip ${active ? "is-active" : ""}`} scroll={false}>
      {children}
    </Link>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-400">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 7h16M4 12h10M4 17h7" />
        </svg>
      </div>
      <div className="text-sm font-medium text-gray-700">{title}</div>
      {hint ? <div className="mt-0.5 text-xs text-gray-500">{hint}</div> : null}
    </div>
  );
}

export function PhoneButton({ phone, size = "sm", label }: { phone: string | null | undefined; size?: "sm" | "md"; label?: string }) {
  const first = (phone ?? "").split(";")[0].trim();
  if (!first) return <span className="text-xs text-gray-400">ნომერი არ არის</span>;
  return (
    <a
      href={`tel:+995${first.replace(/^\+?995/, "")}`}
      className={`ui-btn ui-btn-primary ${size === "sm" ? "ui-btn-sm" : ""} font-mono`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25c1.1.37 2.3.57 3.6.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1L6.6 10.8z" />
      </svg>
      {label ?? first}
    </a>
  );
}

// Legacy class helpers (kept for existing imports)
export const inputClass = "ui-field";
export const buttonClass = "ui-btn ui-btn-primary";
export const buttonSecondary = "ui-btn ui-btn-secondary";
