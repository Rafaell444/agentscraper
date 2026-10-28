"use client";

import { useEffect, useRef, useState } from "react";
import type { PhoneMatch } from "@/lib/phones";

type Match = Omit<PhoneMatch, "date"> & { date: Date | string | null };

function day(value: Date | string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ka-GE");
}

/** "N posts with this number" button; opens a popup listing them. */
export function PhoneMatchesButton({ matches, phone }: { matches: Match[]; phone?: string | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  if (!matches.length) return null;
  const listings = matches.filter((m) => m.kind === "listing").length;
  const banners = matches.length - listings;
  const label = [listings ? `${listings} განცხადება` : "", banners ? `${banners} ბანერი` : ""].filter(Boolean).join(" + ");
  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className="ui-btn ui-btn-sm border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100">
        🔎 ამ ნომრით: {label}
      </button>
      <dialog ref={dialog} className="m-auto w-[min(640px,calc(100vw-2rem))] rounded-xl border border-gray-200 p-0 shadow-xl backdrop:bg-black/40" onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">ნომრით {phone ? <span className="font-mono">{phone}</span> : ""} ნაპოვნია {matches.length}</h2>
          <button type="button" onClick={() => dialog.current?.close()} className="ui-btn ui-btn-ghost ui-btn-sm" aria-label="დახურვა">✕</button>
        </div>
        <ul className="max-h-[70vh] divide-y divide-gray-100 overflow-y-auto">
          {matches.map((m) => (
            <li key={`${m.kind}:${m.id}`}>
              <a href={m.href} target="_blank" rel="noreferrer" className="block px-4 py-2.5 hover:bg-gray-50">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${m.kind === "banner" ? "bg-violet-100 text-violet-800" : "bg-emerald-100 text-emerald-800"}`}>{m.site}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{m.title}</span>
                  {m.archived ? <span className="text-[10px] text-gray-400">არქივი</span> : null}
                </div>
                <div className="mt-0.5 text-xs text-gray-500">{[m.price, m.place, day(m.date)].filter(Boolean).join(" · ")}</div>
              </a>
            </li>
          ))}
        </ul>
      </dialog>
    </>
  );
}

/** Phone input that checks the CRM while the agent types. */
export function PhoneField({ name = "phone", defaultValue = "", excludeBannerId }: { name?: string; defaultValue?: string; excludeBannerId?: string }) {
  const [value, setValue] = useState(defaultValue);
  const [matches, setMatches] = useState<Match[]>([]);
  useEffect(() => {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 9) {
      setMatches([]);
      return;
    }
    const timer = setTimeout(async () => {
      const query = new URLSearchParams({ phone: value, ...(excludeBannerId ? { exclude: excludeBannerId } : {}) });
      const result = await fetch(`/api/phone-matches?${query}`).then((r) => r.json()).catch(() => null);
      setMatches(result?.matches ?? []);
    }, 400);
    return () => clearTimeout(timer);
  }, [value, excludeBannerId]);
  return (
    <div className="space-y-1.5">
      <input name={name} value={value} onChange={(e) => setValue(e.target.value)} inputMode="tel" placeholder="599 12 34 56" className="ui-field" autoComplete="off" />
      <PhoneMatchesButton matches={matches} phone={value} />
    </div>
  );
}
