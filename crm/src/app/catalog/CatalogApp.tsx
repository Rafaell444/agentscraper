"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEAL_LABEL, FEATURES, PETS, placeName, priceText, roomsLabel, termText, typeLabel, type CatalogItem, type DealKind, type Lang } from "@/lib/catalog";
import { mapView } from "@/lib/map";
import { Gallery } from "@/app/s/[token]/Gallery";
import { DICT, type Dict } from "./i18n";
import { MapView, shortPrice } from "./MapView";
import { haptic, openTelegram, tg } from "./tg";

type Filters = { deal: DealKind; type: string; districts: string[]; priceMin: string; priceMax: string; rooms: number[]; areaMin: string; pets: boolean; features: string[] };
type Sort = "new" | "priceAsc" | "priceDesc" | "area";
type Tab = "list" | "map" | "saved" | "request";
type Sheet = null | "filters" | { kind: "viewing" | "question"; ref: number };

const FAV_KEY = "catalog_fav";
const PAGE = 24;

function num(value: string): number | null {
  const n = Number(value.replace(/[^\d.]/g, ""));
  return value.trim() && Number.isFinite(n) && n > 0 ? n : null;
}

function matches(item: CatalogItem, f: Filters, q: string, lang: Lang): boolean {
  if (item.kind !== f.deal) return false;
  if (f.type && (item.type ?? "ბინა") !== f.type) return false;
  if (f.districts.length && !f.districts.includes(item.district ?? "")) return false;
  const min = num(f.priceMin);
  const max = num(f.priceMax);
  if (min && (item.usd ?? 0) < min) return false;
  if (max && (item.usd == null || item.usd > max)) return false;
  if (f.rooms.length && !f.rooms.some((r) => (r >= 4 ? (item.rooms ?? 0) >= 4 : item.rooms === r))) return false;
  const area = num(f.areaMin);
  if (area && (item.area ?? 0) < area) return false;
  if (f.pets && item.pets !== "yes" && item.pets !== "ask") return false;
  if (f.features.length && !f.features.every((k) => item.features.includes(k))) return false;
  if (q) {
    const needle = q.toLowerCase().replace(/^#/, "");
    if (/^\d+$/.test(needle) && String(item.ref).includes(needle)) return true;
    const hay = [item.location, item.district, placeName(item.location, lang), placeName(item.district, lang), placeName(item.location, lang === "en" ? "ru" : "en")].join(" ").toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  return true;
}

function sortItems(items: CatalogItem[], sort: Sort): CatalogItem[] {
  const list = [...items];
  if (sort === "priceAsc") list.sort((a, b) => (a.usd ?? 1e12) - (b.usd ?? 1e12));
  else if (sort === "priceDesc") list.sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1));
  else if (sort === "area") list.sort((a, b) => (b.area ?? 0) - (a.area ?? 0));
  else list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return list;
}

function isNew(item: CatalogItem) {
  return Date.now() - Date.parse(item.createdAt) < 3 * 86400_000;
}

function title(item: CatalogItem, lang: Lang): string {
  const flat = !item.type || item.type === "ბინა";
  const rooms = flat && item.rooms ? roomsLabel(item.rooms, lang) : "";
  const type = typeLabel(item.type, lang);
  return rooms ? `${rooms} ${type.toLowerCase()}` : type;
}

function m2(lang: Lang): string {
  return lang === "ru" ? "м²" : lang === "ka" ? "მ²" : "m²";
}

function useFavorites() {
  const [favs, setFavs] = useState<number[]>([]);
  useEffect(() => {
    try {
      setFavs(JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]"));
    } catch {
      // storage blocked
    }
    // Telegram CloudStorage keeps favourites across the user's devices.
    tg()?.CloudStorage?.getItem(FAV_KEY, (err, value) => {
      if (err || !value) return;
      try {
        setFavs(JSON.parse(value));
      } catch {
        // ignore
      }
    });
  }, []);
  const toggle = useCallback((ref: number) => {
    haptic("tap");
    setFavs((current) => {
      const next = current.includes(ref) ? current.filter((r) => r !== ref) : [ref, ...current];
      const json = JSON.stringify(next.slice(0, 200));
      try {
        localStorage.setItem(FAV_KEY, json);
      } catch {
        // storage blocked
      }
      try {
        tg()?.CloudStorage?.setItem(FAV_KEY, json);
      } catch {
        // older clients
      }
      return next;
    });
  }, []);
  return { favs, toggle };
}

/** Language a channel link asks for: start param "p1001_ru" / "home_en", or ?lang= on the web. */
function linkLang(): Lang | null {
  const start = tg()?.initDataUnsafe?.start_param ?? new URLSearchParams(location.search).get("tgWebAppStartParam") ?? "";
  const value = start.match(/_(ka|en|ru)$/)?.[1] ?? new URLSearchParams(location.search).get("lang");
  return value === "ka" || value === "en" || value === "ru" ? value : null;
}

function detectLang(): Lang {
  const fromLink = linkLang();
  if (fromLink) return fromLink;
  try {
    const saved = localStorage.getItem("catalog_lang");
    if (saved === "ka" || saved === "en" || saved === "ru") return saved;
  } catch {
    // storage blocked
  }
  const code = (tg()?.initDataUnsafe?.user?.language_code ?? navigator.language ?? "en").slice(0, 2);
  return code === "ka" || code === "ru" ? code : code === "uk" || code === "be" || code === "kk" ? "ru" : "en";
}

export function CatalogApp({ items, agency, manager, phone, linkTemplate }: { items: CatalogItem[]; agency: string; manager: string | null; phone: string | null; linkTemplate: string }) {
  const [lang, setLang] = useState<Lang>("en");
  const t = DICT[lang];
  const deals = useMemo(() => (["rent", "sale", "daily"] as DealKind[]).filter((d) => items.some((i) => i.kind === d)), [items]);
  const emptyFilters = useCallback((deal: DealKind): Filters => ({ deal, type: "", districts: [], priceMin: "", priceMax: "", rooms: [], areaMin: "", pets: false, features: [] }), []);
  const [filters, setFilters] = useState<Filters>(() => emptyFilters(deals[0] ?? "rent"));
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [tab, setTab] = useState<Tab>("list");
  const [openRef, setOpenRef] = useState<number | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [mapSelected, setMapSelected] = useState<number | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [toast, setToast] = useState<string | null>(null);
  // Hidden until the viewer's language is known, so it does not flash English first.
  const [ready, setReady] = useState(false);
  const { favs, toggle } = useFavorites();

  // Telegram setup, language and the listing to open (?p=1023 or startapp=p1023).
  useEffect(() => {
    setLang(detectLang());
    setReady(true);
    const app = tg();
    if (app) {
      app.ready();
      app.expand();
      try {
        app.setHeaderColor?.("secondary_bg_color");
        app.setBackgroundColor?.("secondary_bg_color");
      } catch {
        // older clients
      }
    }
    const start = app?.initDataUnsafe?.start_param ?? new URLSearchParams(location.search).get("tgWebAppStartParam") ?? "";
    const fromUrl = new URLSearchParams(location.search).get("p");
    if (/^map(_|$)/.test(start) || new URLSearchParams(location.search).get("tab") === "map") setTab("map");
    const ref = Number(fromUrl ?? start.match(/^p(\d+)(_|$)/)?.[1] ?? 0);
    if (ref) {
      setOpenRef(ref);
      history.replaceState({ p: ref }, "", `?p=${ref}`);
    }
    const onPop = (event: PopStateEvent) => {
      setSheet(null);
      setOpenRef((event.state as { p?: number } | null)?.p ?? null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const changeLang = (value: Lang) => {
    setLang(value);
    haptic("select");
    try {
      localStorage.setItem("catalog_lang", value);
    } catch {
      // storage blocked
    }
  };

  const openItem = useCallback((ref: number) => {
    haptic("tap");
    setOpenRef(ref);
    history.pushState({ p: ref }, "", `?p=${ref}`);
    window.scrollTo({ top: 0 });
    fetch("/api/catalog/view", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref }) }).catch(() => undefined);
  }, []);

  const closeTop = useCallback(() => {
    if (sheet) setSheet(null);
    else if (openRef) {
      if (history.state?.p) history.back();
      else {
        setOpenRef(null);
        history.replaceState(null, "", location.pathname);
      }
    }
  }, [sheet, openRef]);

  // Telegram's own back button closes the sheet / listing.
  useEffect(() => {
    const back = tg()?.BackButton;
    if (!back) return;
    if (sheet || openRef) back.show();
    else back.hide();
    back.onClick(closeTop);
    return () => back.offClick(closeTop);
  }, [sheet, openRef, closeTop]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  const results = useMemo(() => sortItems(items.filter((i) => matches(i, filters, query.trim(), lang)), sort), [items, filters, query, sort, lang]);
  useEffect(() => setLimit(PAGE), [filters, query, sort]);
  const districts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) if (i.kind === filters.deal && i.district) counts.set(i.district, (counts.get(i.district) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [items, filters.deal]);
  const activeCount = [filters.type, filters.districts.length, filters.priceMin, filters.priceMax, filters.rooms.length, filters.areaMin, filters.pets, filters.features.length].filter(Boolean).length;

  const share = (item: CatalogItem) => {
    const link = linkTemplate.replace("{ref}", String(item.ref));
    const text = `${title(item, lang)} · ${priceText(item.price, item.currency, item.kind, lang)}`;
    if (tg()) openTelegram(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
    else if (navigator.share) navigator.share({ url: link, text }).catch(() => undefined);
    else navigator.clipboard?.writeText(link).then(() => setToast(t.linkCopied));
  };
  const askManager = (item?: CatalogItem) => {
    if (!manager) return;
    const text = item ? `#${item.ref} — ${title(item, lang)}, ${priceText(item.price, item.currency, item.kind, lang)}` : "";
    openTelegram(text ? `${manager}?text=${encodeURIComponent(text)}` : manager);
  };

  const openItemData = openRef ? items.find((i) => i.ref === openRef) ?? null : null;
  const savedItems = items.filter((i) => favs.includes(i.ref));

  return (
    <div
      className={`min-h-screen bg-[var(--bg2)] text-[var(--text)] ${ready ? "" : "invisible"}`}
      style={
        {
          "--bg": "var(--tg-theme-section-bg-color, var(--tg-theme-bg-color, #ffffff))",
          "--bg2": "var(--tg-theme-secondary-bg-color, #f1f3f5)",
          "--text": "var(--tg-theme-text-color, #111827)",
          "--hint": "var(--tg-theme-hint-color, #6b7280)",
          "--line": "color-mix(in srgb, var(--hint) 25%, transparent)",
          "--accent": "#059669",
        } as React.CSSProperties
      }
    >
      {openRef ? (
        <Detail
          item={openItemData}
          items={items}
          lang={lang}
          t={t}
          fav={openItemData ? favs.includes(openItemData.ref) : false}
          onFav={toggle}
          onOpen={openItem}
          onBack={closeTop}
          onViewing={(ref) => setSheet({ kind: "viewing", ref })}
          onAsk={manager ? askManager : () => openItemData && setSheet({ kind: "question", ref: openItemData.ref })}
          onShare={share}
          phone={phone}
        />
      ) : (
        <div className="pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
          <header className="sticky top-0 z-20 space-y-2 bg-[var(--bg2)]/95 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-white">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-8 9 8M5 10v10h14V10" /></svg>
              </span>
              <span className="flex-1 truncate text-base font-bold">{agency}</span>
              <div className="flex rounded-lg bg-[var(--bg)] p-0.5 text-xs font-semibold">
                {(["ka", "en", "ru"] as Lang[]).map((l) => (
                  <button key={l} type="button" onClick={() => changeLang(l)} className={`rounded-md px-2 py-1 ${lang === l ? "bg-[var(--accent)] text-white" : "text-[var(--hint)]"}`}>{l.toUpperCase()}</button>
                ))}
              </div>
            </div>
            {tab === "list" || tab === "map" ? (
              <>
                <div className="flex gap-2">
                  <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-[var(--bg)] px-3">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-[var(--hint)]"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-[var(--hint)]" />
                    {query ? <button type="button" onClick={() => setQuery("")} className="text-[var(--hint)]" aria-label="clear">✕</button> : null}
                  </label>
                  <button type="button" onClick={() => { haptic("tap"); setSheet("filters"); }} className="relative flex items-center gap-1.5 rounded-xl bg-[var(--bg)] px-3 text-sm font-medium">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
                    {activeCount ? <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[11px] font-bold text-white">{activeCount}</span> : null}
                  </button>
                </div>
                <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {deals.length > 1 ? (
                    <div className="flex shrink-0 rounded-full bg-[var(--bg)] p-0.5">
                      {deals.map((d) => (
                        <button key={d} type="button" onClick={() => { haptic("select"); setFilters({ ...emptyFilters(d) }); }} className={`rounded-full px-3 py-1 text-sm font-semibold ${filters.deal === d ? "bg-[var(--accent)] text-white" : "text-[var(--hint)]"}`}>
                          {t[d]}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {[1, 2, 3, 4].map((r) => (
                    <QuickChip key={r} active={filters.rooms.includes(r)} onClick={() => setFilters((f) => ({ ...f, rooms: f.rooms.includes(r) ? f.rooms.filter((x) => x !== r) : [...f.rooms, r] }))}>
                      {r === 4 ? "4+" : r} {lang === "ka" ? "ოთ." : lang === "ru" ? "к." : "rm"}
                    </QuickChip>
                  ))}
                  {filters.deal !== "sale" ? <QuickChip active={filters.pets} onClick={() => setFilters((f) => ({ ...f, pets: !f.pets }))}>{t.petsOk}</QuickChip> : null}
                  {districts.slice(0, 8).map((d) => (
                    <QuickChip key={d} active={filters.districts.includes(d)} onClick={() => setFilters((f) => ({ ...f, districts: f.districts.includes(d) ? f.districts.filter((x) => x !== d) : [...f.districts, d] }))}>
                      {placeName(d, lang)}
                    </QuickChip>
                  ))}
                </div>
              </>
            ) : null}
          </header>

          {tab === "list" ? (
            <main className="space-y-3 px-3">
              <div className="flex items-center justify-between text-xs text-[var(--hint)]">
                <span>{t.found(results.length)}</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-lg bg-transparent py-1 text-right font-medium text-[var(--text)] outline-none">
                  <option value="new">{t.sortNew}</option>
                  <option value="priceAsc">{t.sortPriceAsc}</option>
                  <option value="priceDesc">{t.sortPriceDesc}</option>
                  <option value="area">{t.sortArea}</option>
                </select>
              </div>
              {results.length === 0 ? (
                <Empty t={t} onReset={() => { setFilters(emptyFilters(filters.deal)); setQuery(""); }} onRequest={() => setTab("request")} />
              ) : (
                <>
                  {results.slice(0, limit).map((item) => (
                    <Card key={item.ref} item={item} lang={lang} t={t} fav={favs.includes(item.ref)} onFav={toggle} onOpen={openItem} />
                  ))}
                  {results.length > limit ? <More onMore={() => setLimit((l) => l + PAGE)} /> : null}
                </>
              )}
            </main>
          ) : null}

          {tab === "map" ? (
            <div className="relative h-[calc(100vh-11.5rem-env(safe-area-inset-bottom))] min-h-[320px] overflow-hidden">
              <MapView items={results} selected={mapSelected} onSelect={setMapSelected} />
              {!results.some((i) => i.point) ? <div className="pointer-events-none absolute inset-x-3 top-3 z-[500] rounded-xl bg-[var(--bg)] p-3 text-center text-sm text-[var(--hint)] shadow">{t.mapEmpty}</div> : null}
              {mapSelected ? (
                <div className="absolute inset-x-3 bottom-3 z-[500]">
                  {(() => {
                    const item = results.find((i) => i.ref === mapSelected);
                    return item ? <Card item={item} lang={lang} t={t} fav={favs.includes(item.ref)} onFav={toggle} onOpen={openItem} compact /> : null;
                  })()}
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === "saved" ? (
            <main className="space-y-3 px-3 pt-1">
              {savedItems.length === 0 ? (
                <div className="rounded-2xl bg-[var(--bg)] p-8 text-center text-sm text-[var(--hint)]">♡<br />{t.savedEmpty}</div>
              ) : (
                savedItems.map((item) => <Card key={item.ref} item={item} lang={lang} t={t} fav onFav={toggle} onOpen={openItem} />)
              )}
            </main>
          ) : null}

          {tab === "request" ? (
            <main className="px-3 pt-1">
              <div className="rounded-2xl bg-[var(--bg)] p-4">
                <h2 className="text-lg font-bold">{t.findTitle}</h2>
                <p className="mt-1 text-sm text-[var(--hint)]">{t.findText}</p>
                <LeadForm kind="search" lang={lang} t={t} districts={districts} deals={deals} defaultDeal={filters.deal} onDone={() => setTab("list")} />
              </div>
            </main>
          ) : null}

          <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-[var(--line)] bg-[var(--bg)] pb-[env(safe-area-inset-bottom)]">
            {([
              ["list", t.tabList, "M4 6h16M4 12h16M4 18h10"],
              ["map", t.tabMap, "M12 21s-7-6.5-7-11a7 7 0 1 1 14 0c0 4.5-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"],
              ["saved", t.tabSaved, "M12 20s-7-4.4-9-8.6C1.6 8.3 3.5 5 6.8 5c2 0 3.4 1.1 5.2 3 1.8-1.9 3.2-3 5.2-3 3.3 0 5.2 3.3 3.8 6.4C19 15.6 12 20 12 20z"],
              ["request", t.tabRequest, "M12 5v14M5 12h14"],
            ] as [Tab, string, string][]).map(([value, label, icon]) => (
              <button key={value} type="button" onClick={() => { haptic("select"); setTab(value); setMapSelected(null); window.scrollTo({ top: 0 }); }} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${tab === value ? "text-[var(--accent)]" : "text-[var(--hint)]"}`}>
                <span className="relative">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill={value === "saved" && tab === value ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
                  {value === "saved" && favs.length ? <span className="absolute -right-2 -top-1 rounded-full bg-[var(--accent)] px-1 text-[9px] font-bold text-white">{favs.length}</span> : null}
                </span>
                {label}
              </button>
            ))}
          </nav>
        </div>
      )}

      {sheet === "filters" ? (
        <BottomSheet onClose={() => setSheet(null)}>
          <FilterPanel filters={filters} setFilters={setFilters} districts={districts} lang={lang} t={t} items={items} count={results.length} onReset={() => setFilters(emptyFilters(filters.deal))} onApply={() => { haptic("tap"); setSheet(null); }} />
        </BottomSheet>
      ) : null}
      {sheet && typeof sheet === "object" ? (
        <BottomSheet onClose={() => setSheet(null)}>
          {(() => {
            const item = items.find((i) => i.ref === sheet.ref);
            return (
              <>
                <h2 className="text-lg font-bold">{sheet.kind === "viewing" ? t.requestViewing : t.ask}</h2>
                {item ? <p className="mt-0.5 text-sm text-[var(--hint)]">#{item.ref} · {title(item, lang)} · {priceText(item.price, item.currency, item.kind, lang)}</p> : null}
                <LeadForm kind={sheet.kind} item={item} lang={lang} t={t} onDone={() => setSheet(null)} />
              </>
            );
          })()}
        </BottomSheet>
      ) : null}

      {toast ? <div className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit rounded-full bg-black/80 px-4 py-2 text-sm text-white">{toast}</div> : null}
    </div>
  );
}

function QuickChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={() => { haptic("select"); onClick(); }} className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium ${active ? "bg-[var(--accent)] text-white" : "bg-[var(--bg)] text-[var(--text)]"}`}>
      {children}
    </button>
  );
}

function More({ onMore }: { onMore: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && onMore(), { rootMargin: "600px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onMore]);
  return <div ref={ref} className="h-10" />;
}

function Empty({ t, onReset, onRequest }: { t: Dict; onReset: () => void; onRequest: () => void }) {
  return (
    <div className="rounded-2xl bg-[var(--bg)] p-6 text-center">
      <div className="text-3xl">🏠</div>
      <div className="mt-2 font-semibold">{t.noResults}</div>
      <p className="mt-1 text-sm text-[var(--hint)]">{t.noResultsHint}</p>
      <div className="mt-4 flex justify-center gap-2">
        <button type="button" onClick={onReset} className="rounded-xl bg-[var(--bg2)] px-4 py-2 text-sm font-medium">{t.reset}</button>
        <button type="button" onClick={onRequest} className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white">{t.tabRequest}</button>
      </div>
    </div>
  );
}

function Heart({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label="save" className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur">
      <svg width="18" height="18" viewBox="0 0 24 24" fill={on ? "#f43f5e" : "none"} stroke={on ? "#f43f5e" : "currentColor"} strokeWidth="2"><path d="M12 20s-7-4.4-9-8.6C1.6 8.3 3.5 5 6.8 5c2 0 3.4 1.1 5.2 3 1.8-1.9 3.2-3 5.2-3 3.3 0 5.2 3.3 3.8 6.4C19 15.6 12 20 12 20z" /></svg>
    </button>
  );
}

function PhotoStrip({ photos, t, height }: { photos: string[]; t: Dict; height: string }) {
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const shown = photos.slice(0, 8);
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  if (!shown.length) return <div className={`flex ${height} items-center justify-center bg-[var(--bg2)] text-4xl`}>🏠</div>;
  return (
    <div className="relative">
      <div ref={strip} className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {shown.map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={url} src={url} alt="" loading={i === 0 ? "eager" : "lazy"} draggable={false} className={`${height} w-full shrink-0 snap-center object-cover`} />
        ))}
      </div>
      {photos.length > 1 ? <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">{t.photosOf(index + 1, photos.length)}</span> : null}
      {shown.length > 1 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1">
          {shown.map((url, i) => <span key={url} className={`h-1.5 rounded-full bg-white transition-all ${i === index ? "w-4" : "w-1.5 opacity-60"}`} />)}
        </div>
      ) : null}
    </div>
  );
}

function Facts({ item, lang, t }: { item: CatalogItem; lang: Lang; t: Dict }) {
  const facts = [
    item.rooms ? [String(item.rooms), t.rooms] : null,
    item.area ? [`${item.area} ${m2(lang)}`, t.area] : null,
    item.floor ? [`${item.floor}${item.totalFloors ? `/${item.totalFloors}` : ""}`, t.floor] : null,
    item.bedrooms ? [String(item.bedrooms), t.bedrooms] : null,
  ].filter(Boolean) as [string, string][];
  if (!facts.length) return null;
  return (
    <div className="grid grid-cols-4 gap-1 text-center">
      {facts.slice(0, 4).map(([value, label]) => (
        <div key={label}>
          <div className="text-sm font-semibold">{value}</div>
          <div className="text-[11px] text-[var(--hint)]">{label}</div>
        </div>
      ))}
    </div>
  );
}

function Card({ item, lang, t, fav, onFav, onOpen, compact = false }: { item: CatalogItem; lang: Lang; t: Dict; fav: boolean; onFav: (ref: number) => void; onOpen: (ref: number) => void; compact?: boolean }) {
  const place = placeName(item.location || item.district, lang);
  if (compact) {
    return (
      <button type="button" onClick={() => onOpen(item.ref)} className="flex w-full gap-3 overflow-hidden rounded-2xl bg-[var(--bg)] p-2 text-left shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {item.photos[0] ? <img src={item.photos[0]} alt="" className="h-20 w-24 shrink-0 rounded-xl object-cover" /> : <div className="flex h-20 w-24 shrink-0 items-center justify-center rounded-xl bg-[var(--bg2)] text-2xl">🏠</div>}
        <div className="min-w-0 flex-1 py-0.5">
          <div className="text-base font-bold">{priceText(item.price, item.currency, item.kind, lang)}</div>
          <div className="truncate text-sm">{title(item, lang)}{item.area ? ` · ${item.area} ${m2(lang)}` : ""}</div>
          <div className="truncate text-xs text-[var(--hint)]">{place}</div>
        </div>
        <span className="self-center pr-1 text-[var(--accent)]">›</span>
      </button>
    );
  }
  return (
    <article className="overflow-hidden rounded-2xl bg-[var(--bg)] shadow-sm">
      <div className="relative" onClick={() => onOpen(item.ref)}>
        <PhotoStrip photos={item.photos} t={t} height="h-56" />
        <div className="absolute left-2 top-2 flex gap-1">
          {isNew(item) ? <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[11px] font-bold text-white">{t.isNew}</span> : null}
          {item.availability === "reserved" ? <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white">{t.reserved}</span> : null}
        </div>
        <div className="absolute right-2 top-2">
          <Heart on={fav} onClick={() => onFav(item.ref)} />
        </div>
        <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/50 px-1.5 py-0.5 font-mono text-[10px] text-white">#{item.ref}</span>
      </div>
      <button type="button" onClick={() => onOpen(item.ref)} className="block w-full space-y-2 p-3 text-left">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xl font-bold">{priceText(item.price, item.currency, item.kind, lang)}</span>
          <span className="truncate text-sm text-[var(--hint)]">{title(item, lang)}</span>
        </div>
        <Facts item={item} lang={lang} t={t} />
        {place ? (
          <div className="flex items-center gap-1.5 text-sm text-[var(--hint)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><path d="M12 21s-7-6.5-7-11a7 7 0 1 1 14 0c0 4.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
            <span className="truncate">{place}</span>
          </div>
        ) : null}
        {item.features.length || item.pets === "yes" ? (
          <div className="flex flex-wrap gap-1">
            {item.pets === "yes" ? <span className="rounded-full bg-[var(--bg2)] px-2 py-0.5 text-[11px]">🐾</span> : null}
            {item.features.slice(0, 5).map((k) => {
              const f = FEATURES.find((x) => x.key === k)!;
              return <span key={k} className="rounded-full bg-[var(--bg2)] px-2 py-0.5 text-[11px]">{f.emoji} {f[lang]}</span>;
            })}
          </div>
        ) : null}
      </button>
    </article>
  );
}

function Detail({ item, items, lang, t, fav, onFav, onOpen, onBack, onViewing, onAsk, onShare, phone }: {
  item: CatalogItem | null; items: CatalogItem[]; lang: Lang; t: Dict; fav: boolean; onFav: (ref: number) => void; onOpen: (ref: number) => void; onBack: () => void;
  onViewing: (ref: number) => void; onAsk: (item?: CatalogItem) => void; onShare: (item: CatalogItem) => void; phone: string | null;
}) {
  const inTelegram = Boolean(tg());
  if (!item) {
    return (
      <div className="p-4">
        {!inTelegram ? <button type="button" onClick={onBack} className="mb-3 text-sm text-[var(--accent)]">← {t.tabList}</button> : null}
        <div className="rounded-2xl bg-[var(--bg)] p-6 text-center">
          <div className="text-3xl">🔑</div>
          <div className="mt-2 font-semibold">{t.noResults}</div>
          <p className="mt-1 text-sm text-[var(--hint)]">{t.noResultsHint}</p>
        </div>
      </div>
    );
  }
  const place = placeName(item.location || item.district, lang);
  const map = item.point ? mapView(item.point.lat, item.point.lng, item.point.exact ? "exact" : "approx") : null;
  const perM2 = item.kind === "sale" && item.price && item.area ? Math.round(item.price / item.area) : null;
  const description = item.description[lang];
  const similar = items
    .filter((i) => i.ref !== item.ref && i.kind === item.kind && (i.district === item.district || (item.usd && i.usd && Math.abs(i.usd - item.usd) / item.usd < 0.25)))
    .slice(0, 8);
  const rows = [
    [t.rooms, item.rooms],
    [t.bedrooms, item.bedrooms],
    [t.baths, item.bathrooms],
    [t.area, item.area ? `${item.area} ${m2(lang)}` : null],
    [t.floor, item.floor ? `${item.floor}${item.totalFloors ? ` / ${item.totalFloors}` : ""}` : null],
    [t.perM2, perM2 ? `$${perM2.toLocaleString("en-US")}` : null],
    [t.term, item.kind === "rent" && item.leaseTerm ? termText(item.leaseTerm, lang) : null],
    [t.condition, item.condition && lang === "ka" ? item.condition : null],
    [t.type, typeLabel(item.type, lang)],
  ].filter(([, v]) => v != null && v !== "") as [string, string | number][];

  return (
    <div className="pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <div className="relative">
        <Gallery urls={item.photos} />
        <div className="absolute inset-x-2 top-[max(0.5rem,env(safe-area-inset-top))] flex justify-between">
          {!inTelegram ? (
            <button type="button" onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur" aria-label="back">←</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={() => onShare(item)} aria-label={t.share} className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" /></svg>
            </button>
            <Heart on={fav} onClick={() => onFav(item.ref)} />
          </div>
        </div>
      </div>

      <div className="space-y-3 p-3">
        <section className="space-y-2 rounded-2xl bg-[var(--bg)] p-4">
          <div className="flex items-center gap-2 text-xs text-[var(--hint)]">
            <span className="font-mono">#{item.ref}</span>
            <span>· {DEAL_LABEL[item.kind][lang]}</span>
            {item.availability === "reserved" ? <span className="rounded-full bg-amber-500 px-2 py-0.5 font-bold text-white">{t.reserved}</span> : null}
          </div>
          <div className="text-2xl font-bold">{priceText(item.price, item.currency, item.kind, lang)}</div>
          <h1 className="text-base font-semibold">{title(item, lang)}{item.area ? `, ${item.area} ${m2(lang)}` : ""}</h1>
          {place ? <div className="text-sm text-[var(--hint)]">📍 {place}</div> : null}
        </section>

        <section className="rounded-2xl bg-[var(--bg)] p-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] text-[var(--hint)]">{label}</dt>
                <dd className="text-sm font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          {item.features.length || item.pets ? (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[var(--line)] pt-3">
              {item.pets && PETS[item.pets] ? <span className="rounded-full bg-[var(--bg2)] px-2.5 py-1 text-xs">🐾 {PETS[item.pets][lang]}</span> : null}
              {item.features.map((k) => {
                const f = FEATURES.find((x) => x.key === k)!;
                return <span key={k} className="rounded-full bg-[var(--bg2)] px-2.5 py-1 text-xs">{f.emoji} {f[lang]}</span>;
              })}
            </div>
          ) : null}
        </section>

        {description ? (
          <section className="rounded-2xl bg-[var(--bg)] p-4">
            <h2 className="mb-1.5 text-sm font-semibold">{t.description}</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed">{description}</p>
          </section>
        ) : null}

        {map ? (
          <section className="overflow-hidden rounded-2xl bg-[var(--bg)]">
            <h2 className="px-4 pt-3 text-sm font-semibold">{t.location}</h2>
            <iframe title="map" src={map.embedUrl} className="mt-2 h-56 w-full border-0" loading="lazy" referrerPolicy="no-referrer" />
            {!map.exact ? <p className="px-4 py-2 text-xs text-[var(--hint)]">{t.approxNote}</p> : null}
          </section>
        ) : null}

        {similar.length ? (
          <section>
            <h2 className="mb-2 px-1 text-sm font-semibold">{t.similar}</h2>
            <div className="-mx-3 flex snap-x gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {similar.map((s) => (
                <button key={s.ref} type="button" onClick={() => onOpen(s.ref)} className="w-44 shrink-0 snap-start overflow-hidden rounded-2xl bg-[var(--bg)] text-left">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {s.photos[0] ? <img src={s.photos[0]} alt="" loading="lazy" className="h-28 w-full object-cover" /> : <div className="flex h-28 items-center justify-center bg-[var(--bg2)] text-2xl">🏠</div>}
                  <div className="p-2">
                    <div className="text-sm font-bold">{shortPrice(s)}{s.kind === "rent" ? (lang === "ru" ? "/мес" : lang === "ka" ? "/თვე" : "/mo") : ""}</div>
                    <div className="truncate text-xs text-[var(--hint)]">{title(s, lang)} · {placeName(s.district, lang)}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-[var(--line)] bg-[var(--bg)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={() => { haptic("tap"); onViewing(item.ref); }} className="flex-1 rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white">{t.requestViewing}</button>
        <button type="button" onClick={() => onAsk(item)} className="rounded-xl bg-[var(--bg2)] px-4 py-3 text-sm font-semibold" aria-label={t.ask}>💬</button>
        {phone ? <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="rounded-xl bg-[var(--bg2)] px-4 py-3 text-sm font-semibold" aria-label={t.call}>📞</a> : null}
      </div>
    </div>
  );
}

function BottomSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/45" onClick={onClose}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-[var(--bg)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--line)]" />
        {children}
      </div>
    </div>
  );
}

function ChipToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={() => { haptic("select"); onClick(); }} className={`rounded-full border px-3 py-1.5 text-sm ${active ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)]"}`}>
      {children}
    </button>
  );
}

function FilterPanel({ filters, setFilters, districts, lang, t, items, count, onReset, onApply }: {
  filters: Filters; setFilters: React.Dispatch<React.SetStateAction<Filters>>; districts: string[]; lang: Lang; t: Dict; items: CatalogItem[]; count: number; onReset: () => void; onApply: () => void;
}) {
  const types = [...new Set(items.filter((i) => i.kind === filters.deal).map((i) => i.type ?? "ბინა"))];
  const toggleIn = <K extends "districts" | "features">(key: K, value: string) =>
    setFilters((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value] }));
  const box = "w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]";
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{t.filters}</h2>
        <button type="button" onClick={onReset} className="text-sm text-[var(--accent)]">{t.reset}</button>
      </div>
      {types.length > 1 ? (
        <div>
          <div className="mb-1.5 text-xs font-medium text-[var(--hint)]">{t.type}</div>
          <div className="flex flex-wrap gap-1.5">
            <ChipToggle active={!filters.type} onClick={() => setFilters((f) => ({ ...f, type: "" }))}>{t.any}</ChipToggle>
            {types.map((type) => <ChipToggle key={type} active={filters.type === type} onClick={() => setFilters((f) => ({ ...f, type }))}>{typeLabel(type, lang)}</ChipToggle>)}
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="mb-1 block text-xs font-medium text-[var(--hint)]">{t.priceFrom}</span>
          <input inputMode="numeric" value={filters.priceMin} onChange={(e) => setFilters((f) => ({ ...f, priceMin: e.target.value }))} className={box} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-[var(--hint)]">{t.priceTo}</span>
          <input inputMode="numeric" value={filters.priceMax} onChange={(e) => setFilters((f) => ({ ...f, priceMax: e.target.value }))} className={box} />
        </label>
      </div>
      <div>
        <div className="mb-1.5 text-xs font-medium text-[var(--hint)]">{t.rooms}</div>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map((r) => (
            <ChipToggle key={r} active={filters.rooms.includes(r)} onClick={() => setFilters((f) => ({ ...f, rooms: f.rooms.includes(r) ? f.rooms.filter((x) => x !== r) : [...f.rooms, r] }))}>{r === 4 ? "4+" : r}</ChipToggle>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[var(--hint)]">{t.areaMin}</span>
        <input inputMode="numeric" value={filters.areaMin} onChange={(e) => setFilters((f) => ({ ...f, areaMin: e.target.value }))} className={box} />
      </label>
      {districts.length ? (
        <div>
          <div className="mb-1.5 text-xs font-medium text-[var(--hint)]">{t.districts}</div>
          <div className="flex flex-wrap gap-1.5">
            {districts.map((d) => <ChipToggle key={d} active={filters.districts.includes(d)} onClick={() => toggleIn("districts", d)}>{placeName(d, lang)}</ChipToggle>)}
          </div>
        </div>
      ) : null}
      <div>
        <div className="mb-1.5 text-xs font-medium text-[var(--hint)]">{t.features}</div>
        <div className="flex flex-wrap gap-1.5">
          {filters.deal !== "sale" ? <ChipToggle active={filters.pets} onClick={() => setFilters((f) => ({ ...f, pets: !f.pets }))}>{t.petsOk}</ChipToggle> : null}
          {FEATURES.filter((f) => items.some((i) => i.features.includes(f.key))).map((f) => (
            <ChipToggle key={f.key} active={filters.features.includes(f.key)} onClick={() => toggleIn("features", f.key)}>{f.emoji} {f[lang]}</ChipToggle>
          ))}
        </div>
      </div>
      <button type="button" onClick={onApply} className="sticky bottom-0 w-full rounded-xl bg-[var(--accent)] py-3.5 text-sm font-semibold text-white shadow-lg">{t.show(count)}</button>
    </div>
  );
}

function LeadForm({ kind, item, lang, t, districts = [], deals = [], defaultDeal, onDone }: {
  kind: "viewing" | "question" | "search"; item?: CatalogItem; lang: Lang; t: Dict; districts?: string[]; deals?: DealKind[]; defaultDeal?: DealKind; onDone: () => void;
}) {
  const app = tg();
  const user = app?.initDataUnsafe?.user;
  const [name, setName] = useState([user?.first_name, user?.last_name].filter(Boolean).join(" "));
  const [phone, setPhone] = useState("");
  const [when, setWhen] = useState("");
  const [message, setMessage] = useState("");
  const [deal, setDeal] = useState<DealKind>(defaultDeal ?? "rent");
  const [budget, setBudget] = useState("");
  const [rooms, setRooms] = useState<number | null>(null);
  const [areas, setAreas] = useState<string[]>([]);
  const [moveIn, setMoveIn] = useState("");
  const [pets, setPets] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const box = "w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]";

  const shareTgPhone = () => {
    app?.requestContact?.((ok, res) => {
      const number = res?.responseUnsafe?.contact?.phone_number;
      if (ok && number) setPhone(number.startsWith("+") ? number : `+${number}`);
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!app && phone.replace(/\D/g, "").length < 7) {
      setError(t.errPhone);
      haptic("error");
      return;
    }
    setError("");
    setState("sending");
    const parts = [when ? `${t.when} ${when}` : "", pets ? "🐾 pets" : "", message].filter(Boolean);
    try {
      const response = await fetch("/api/catalog/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          ref: item?.ref,
          name,
          phone,
          message: parts.join("\n"),
          lang,
          initData: app?.initData ?? "",
          prefs: kind === "search" ? { deal, budgetMax: num(budget) ?? undefined, roomsMin: rooms ?? undefined, areas, moveIn: moveIn || undefined } : undefined,
        }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setState("sent");
      haptic("success");
    } catch {
      setState("idle");
      setError(t.errGeneric);
      haptic("error");
    }
  };

  if (state === "sent") {
    return (
      <div className="py-6 text-center">
        <div className="text-4xl">✅</div>
        <div className="mt-2 text-lg font-bold">{t.sentTitle}</div>
        <p className="mt-1 text-sm text-[var(--hint)]">{t.sentText}</p>
        <button type="button" onClick={onDone} className="mt-4 w-full rounded-xl bg-[var(--bg2)] py-3 text-sm font-semibold">{t.close}</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3" noValidate>
      {kind === "search" ? (
        <>
          {deals.length > 1 ? (
            <div className="flex flex-wrap gap-1.5">
              {deals.map((d) => <ChipToggle key={d} active={deal === d} onClick={() => setDeal(d)}>{t[d]}</ChipToggle>)}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="mb-1 block text-xs font-medium text-[var(--hint)]">{t.budget}</span>
              <input inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} className={box} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-[var(--hint)]">{t.moveIn}</span>
              <input type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} className={box} />
            </label>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-[var(--hint)]">{t.roomsMin}</div>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4].map((r) => <ChipToggle key={r} active={rooms === r} onClick={() => setRooms(rooms === r ? null : r)}>{r === 4 ? "4+" : `${r}+`}</ChipToggle>)}
              {deal !== "sale" ? <ChipToggle active={pets} onClick={() => setPets(!pets)}>{t.petsOk}</ChipToggle> : null}
            </div>
          </div>
          {districts.length ? (
            <div>
              <div className="mb-1.5 text-xs font-medium text-[var(--hint)]">{t.districts}</div>
              <div className="flex flex-wrap gap-1.5">
                {districts.map((d) => <ChipToggle key={d} active={areas.includes(d)} onClick={() => setAreas(areas.includes(d) ? areas.filter((x) => x !== d) : [...areas, d])}>{placeName(d, lang)}</ChipToggle>)}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      {kind === "viewing" ? (
        <div>
          <div className="mb-1.5 text-xs font-medium text-[var(--hint)]">{t.when}</div>
          <div className="flex flex-wrap gap-1.5">
            {[t.today, t.tomorrow, t.week, t.anytime].map((w) => <ChipToggle key={w} active={when === w} onClick={() => setWhen(when === w ? "" : w)}>{w}</ChipToggle>)}
          </div>
        </div>
      ) : null}
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[var(--hint)]">{t.name}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={box} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[var(--hint)]">{t.phone}{app ? ` — ${t.phoneHint}` : ""}</span>
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="+995 5__ __ __ __" className={box} />
      </label>
      {app?.requestContact && !phone ? (
        <button type="button" onClick={shareTgPhone} className="w-full rounded-xl border border-[var(--line)] py-2.5 text-sm font-medium text-[var(--accent)]">📱 {t.useTgPhone}</button>
      ) : null}
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[var(--hint)]">{t.message}</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className={box} />
      </label>
      {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
      <button type="submit" disabled={state === "sending"} className="w-full rounded-xl bg-[var(--accent)] py-3.5 text-sm font-semibold text-white disabled:opacity-60">{state === "sending" ? t.sending : t.send}</button>
    </form>
  );
}
