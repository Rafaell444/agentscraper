"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { POSTER_KINDS, type FilterOptions, type ListingFilters } from "@/lib/queries";
import { STATUSES, statusLabel } from "@/lib/options";
import { Input, Select, Tabs } from "./ui";
import { rememberListingsQuery } from "./ListingsLink";

type Props = { filters: ListingFilters; options: FilterOptions; userId: string; total: number };

const DEAL_ORDER = ["იყიდება", "ქირავდება", "ქირავდება დღიურად", "გირავდება"];

function toQuery(values: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value && key !== "page") params.set(key, value);
  const text = params.toString();
  return text ? `/listings?${text}` : "/listings";
}

export function FilterBar({ filters, options, userId, total }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState<Record<string, string>>({ ...filters });
  const hasAdvanced = Boolean(filters.priceMin || filters.priceMax || filters.areaMin || filters.areaMax || filters.type || filters.rooms || filters.archived === "1");
  const [advanced, setAdvanced] = useState(hasAdvanced);

  // Keep the draft in sync when the URL changes (back button, chips), and
  // remember the filters so "back to listings" links return to them.
  useEffect(() => {
    setDraft({ ...filters });
    rememberListingsQuery(window.location.search);
  }, [filters]);

  const apply = (next: Record<string, string>) => {
    setDraft(next);
    router.push(toQuery(next), { scroll: false });
  };
  const set = (key: string, value: string) => {
    const next = { ...draft, [key]: value };
    if (key === "district") next.neighbourhood = "";
    apply(next);
  };

  // Debounced free-text search.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearch = (value: string) => {
    setDraft((d) => ({ ...d, q: value }));
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => apply({ ...draft, q: value }), 450);
  };

  const neighbourhoods = draft.district ? options.neighbourhoodsByDistrict[draft.district] ?? [] : options.neighbourhoods;
  const deals = useMemo(() => [...options.deals].sort((a, b) => DEAL_ORDER.indexOf(a) - DEAL_ORDER.indexOf(b)), [options.deals]);

  const quick = [
    { key: "all", label: "ყველა", values: {} as Record<string, string>, active: !filters.days && !filters.status && !filters.phone && !filters.assigned },
    { key: "today", label: "დღეს", values: { days: "1" }, active: filters.days === "1" },
    { key: "week", label: "7 დღე", values: { days: "7" }, active: filters.days === "7" },
    { key: "new", label: "დაუმუშავებელი", values: { status: "new" }, active: filters.status === "new" },
    { key: "phone", label: "ტელეფონით", values: { phone: "1" }, active: filters.phone === "1" },
    { key: "mine", label: "ჩემი", values: { assigned: userId }, active: filters.assigned === userId },
    { key: "hot", label: "დაინტერესდა", values: { status: "interested" }, active: filters.status === "interested" },
  ];
  const quickHref = (values: Record<string, string>, active: boolean) => {
    const base = { ...filters, days: "", status: "", phone: "", assigned: "" };
    return toQuery(active ? base : { ...base, ...values });
  };

  const activeChips: { key: string; label: string }[] = [];
  const push = (key: keyof ListingFilters, label: string) => filters[key] && activeChips.push({ key, label });
  push("q", `„${filters.q}“`);
  push("site", options.sites.find((s) => s.value === filters.site)?.label ?? filters.site);
  push("deal", filters.deal);
  push("type", filters.type);
  push("district", filters.district);
  push("neighbourhood", filters.neighbourhood);
  push("rooms", `${filters.rooms === "5" ? "5+" : filters.rooms} ოთახი`);
  if (filters.priceMin || filters.priceMax) activeChips.push({ key: "price", label: `ფასი ${filters.priceMin || "0"} – ${filters.priceMax || "∞"} $` });
  if (filters.areaMin || filters.areaMax) activeChips.push({ key: "area", label: `${filters.areaMin || "0"} – ${filters.areaMax || "∞"} მ²` });
  push("status", statusLabel(filters.status));
  if (filters.assigned) activeChips.push({ key: "assigned", label: filters.assigned === "none" ? "მიუკუთვნებელი" : options.users.find((u) => u.id === filters.assigned)?.name ?? "აგენტი" });
  if (filters.phone === "1") activeChips.push({ key: "phone", label: "ტელეფონით" });
  if (filters.phone === "0") activeChips.push({ key: "phone", label: "ტელეფონის გარეშე" });
  if (filters.days) activeChips.push({ key: "days", label: `ბოლო ${filters.days} დღე` });
  if (filters.archived === "1") activeChips.push({ key: "archived", label: "არქივის ჩათვლით" });
  const removeHref = (key: string) => {
    const next = { ...filters };
    if (key === "price") next.priceMin = next.priceMax = "";
    else if (key === "area") next.areaMin = next.areaMax = "";
    else (next as Record<string, string>)[key] = "";
    return toQuery(next);
  };

  if (filters.key) activeChips.push({ key: "key", label: "იგივე ობიექტის ყველა განცხადება" });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs items={POSTER_KINDS} current={filters.who} hrefFor={(value) => toQuery({ ...filters, who: value })} />
        <span className="text-xs text-gray-500">
          {filters.who === "owner" ? "მხოლოდ მესაკუთრეების განცხადებები" : filters.who === "agent" ? "აგენტების/სააგენტოების განცხადებები" : "ყველა განმთავსებელი"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {quick.map((item) => (
          <Link key={item.key} href={quickHref(item.values, item.active && item.key !== "all")} scroll={false} className={`ui-chip ${item.active ? "is-active" : ""}`}>
            {item.label}
          </Link>
        ))}
      </div>

      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault();
          apply(draft);
        }}
        className="ui-card p-3"
      >
        <div className="grid gap-2 md:grid-cols-12">
          <div className="relative md:col-span-4">
            <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <Input value={draft.q} onChange={(e) => onSearch(e.target.value)} placeholder="ძებნა: სათაური, მისამართი, სახელი, ID…" className="pl-9" />
          </div>
          <div className="md:col-span-8">
            <div className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
              <button type="button" onClick={() => set("deal", "")} className={`ui-btn ui-btn-sm flex-1 ${!draft.deal ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:bg-white/60"}`}>
                ყველა გარიგება
              </button>
              {deals.map((deal) => (
                <button key={deal} type="button" onClick={() => set("deal", deal)} className={`ui-btn ui-btn-sm flex-1 ${draft.deal === deal ? "bg-white text-emerald-800 shadow-sm" : "text-gray-600 hover:bg-white/60"}`}>
                  {deal}
                </button>
              ))}
            </div>
          </div>

          <Select className="md:col-span-3" value={draft.site} active={Boolean(draft.site)} onChange={(e) => set("site", e.target.value)}>
            <option value="">ყველა საიტი</option>
            {options.sites.map((site) => (
              <option key={site.value} value={site.value}>
                {site.label} ({site.count})
              </option>
            ))}
          </Select>
          <Select className="md:col-span-3" value={draft.district} active={Boolean(draft.district)} onChange={(e) => set("district", e.target.value)}>
            <option value="">ყველა რაიონი</option>
            {options.districts.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name} ({d.count})
              </option>
            ))}
          </Select>
          <Select className="md:col-span-3" value={draft.neighbourhood} active={Boolean(draft.neighbourhood)} onChange={(e) => set("neighbourhood", e.target.value)}>
            <option value="">{draft.district ? `უბანი: ${draft.district}` : "ყველა უბანი"}</option>
            {neighbourhoods.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
          <Select className="md:col-span-3" value={draft.status} active={Boolean(draft.status)} onChange={(e) => set("status", e.target.value)}>
            <option value="">ყველა სტატუსი</option>
            {STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </Select>

          <Select className="md:col-span-3" value={draft.assigned} active={Boolean(draft.assigned)} onChange={(e) => set("assigned", e.target.value)}>
            <option value="">ყველა აგენტი</option>
            <option value="none">მიუკუთვნებელი</option>
            {options.users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </Select>
          <Select className="md:col-span-3" value={["1", "0"].includes(draft.phone) ? draft.phone : ""} active={["1", "0"].includes(draft.phone)} onChange={(e) => set("phone", e.target.value)}>
            <option value="">ტელეფონი: ყველა</option>
            <option value="1">მხოლოდ ტელეფონით</option>
            <option value="0">ტელეფონის გარეშე</option>
          </Select>
          <Select className="md:col-span-3" value={draft.days} active={Boolean(draft.days)} onChange={(e) => set("days", e.target.value)}>
            <option value="">მთელი პერიოდი</option>
            <option value="1">დღეს</option>
            <option value="3">ბოლო 3 დღე</option>
            <option value="7">ბოლო 7 დღე</option>
            <option value="30">ბოლო 30 დღე</option>
          </Select>
          <Select className="md:col-span-3" value={draft.sort} onChange={(e) => set("sort", e.target.value)}>
            <option value="newest">დალაგება: ახალი ჯერ</option>
            <option value="oldest">დალაგება: ძველი ჯერ</option>
            <option value="price_asc">ფასი: იაფიდან</option>
            <option value="price_desc">ფასი: ძვირიდან</option>
            <option value="ppm_asc">$/მ²: იაფიდან</option>
            <option value="area_desc">ფართი: დიდიდან</option>
          </Select>
        </div>

        {advanced ? (
          <div className="mt-2 grid gap-2 border-t border-gray-100 pt-2 md:grid-cols-12">
            <Select className="md:col-span-3" value={draft.type} active={Boolean(draft.type)} onChange={(e) => set("type", e.target.value)}>
              <option value="">ყველა ტიპი</option>
              {options.types.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
            <Select className="md:col-span-2" value={draft.rooms} active={Boolean(draft.rooms)} onChange={(e) => set("rooms", e.target.value)}>
              <option value="">ოთახი: ყველა</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n === 5 ? "5+ ოთახი" : `${n} ოთახი`}
                </option>
              ))}
            </Select>
            <div className="flex items-center gap-1 md:col-span-3">
              <Input value={draft.priceMin} onChange={(e) => setDraft({ ...draft, priceMin: e.target.value })} placeholder="ფასი $ დან" inputMode="numeric" />
              <span className="text-gray-400">–</span>
              <Input value={draft.priceMax} onChange={(e) => setDraft({ ...draft, priceMax: e.target.value })} placeholder="მდე" inputMode="numeric" />
            </div>
            <div className="flex items-center gap-1 md:col-span-3">
              <Input value={draft.areaMin} onChange={(e) => setDraft({ ...draft, areaMin: e.target.value })} placeholder="მ² დან" inputMode="numeric" />
              <span className="text-gray-400">–</span>
              <Input value={draft.areaMax} onChange={(e) => setDraft({ ...draft, areaMax: e.target.value })} placeholder="მდე" inputMode="numeric" />
            </div>
            <label className="flex h-10 items-center gap-2 text-sm text-gray-600 md:col-span-1">
              <input type="checkbox" checked={draft.archived === "1"} onChange={(e) => set("archived", e.target.checked ? "1" : "")} className="h-4 w-4 accent-emerald-600" />
              არქივი
            </label>
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {activeChips.length === 0 ? <span className="text-xs text-gray-400">ფილტრი არ არის არჩეული</span> : null}
            {activeChips.map((chip) => (
              <Link key={chip.key} href={removeHref(chip.key)} scroll={false} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100">
                {chip.label}
                <span aria-hidden className="text-emerald-500">×</span>
              </Link>
            ))}
            {activeChips.length ? (
              <Link href={`/listings?who=${filters.who}`} scroll={false} className="text-xs text-gray-500 underline-offset-2 hover:underline">
                ყველას გასუფთავება
              </Link>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{total.toLocaleString("en-US")} შედეგი</span>
            <button type="button" onClick={() => setAdvanced((value) => !value)} className="ui-btn ui-btn-ghost ui-btn-sm">
              {advanced ? "ნაკლები ფილტრი" : "მეტი ფილტრი"}
            </button>
            {advanced ? (
              <button type="submit" className="ui-btn ui-btn-primary ui-btn-sm">
                გამოყენება
              </button>
            ) : null}
          </div>
        </div>
      </form>
    </div>
  );
}
