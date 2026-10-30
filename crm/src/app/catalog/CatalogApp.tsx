"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEAL_LABEL, FEATURES, LEASE_TERMS, PETS, PROPERTY_TYPES, TBILISI_DISTRICTS, placeName, priceText, roomsLabel, termText, typeLabel, type CatalogItem, type DealKind, type Lang } from "@/lib/catalog";
import { METRO, METRO_LINE_COLOR, metroName } from "@/lib/metro";
import { MediaGallery, NearbySection } from "./Media";
import { DICT, type Dict } from "./i18n";
import { MapView, shortPrice, type Bounds } from "./MapView";
import { haptic, openTelegram, tg } from "./tg";
import { KIND_ORDER, NEAR_MINUTES, PLACE_EMOJI } from "./places";

// near: place kinds (lib/nearby) within NEAR_MINUTES on foot; optional so older saved searches still load.
type Filters = { deal: DealKind; type: string; districts: string[]; priceMin: string; priceMax: string; rooms: number[]; areaMin: string; pets: boolean; features: string[]; nearMetro: boolean; metro: string[]; near?: string[] };
type Sort = "new" | "priceAsc" | "priceDesc" | "area";
type Tab = "home" | "list" | "map" | "saved" | "request";
type SavedSearch = { id: string; filters: Filters; query: string; seen: number; notify?: boolean };
type Facet = "deal" | "price" | "rooms" | "district" | "metro";
type Sheet = null | "filters" | { facet: Facet } | { kind: "viewing" | "question"; ref: number };

// One-tap price ranges per deal type, in USD.
const PRICE_PRESETS: Record<DealKind, [string, string][]> = {
  rent: [["", "500"], ["500", "800"], ["800", "1200"], ["1200", ""]],
  sale: [["", "80000"], ["80000", "150000"], ["150000", "300000"], ["300000", ""]],
  daily: [["", "50"], ["50", "100"], ["100", ""]],
};

function usd(value: string): string {
  return shortPrice({ price: Number(value), currency: "USD" });
}

function priceRangeLabel(min: string, max: string): string {
  if (min && max) return `${usd(min)}–${usd(max).slice(1)}`;
  if (max) return `≤ ${usd(max)}`;
  return `${usd(min)}+`;
}

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
  if (f.nearMetro && !item.metro.some((m) => m.minutes <= 10)) return false;
  if (f.metro.length && !item.metro.some((m) => m.minutes <= 15 && f.metro.includes(m.id))) return false;
  if (f.near?.length && !f.near.every((k) => item.nearby?.some((n) => n.kind === k && n.minutes <= NEAR_MINUTES))) return false;
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
  const favsRef = useRef(favs);
  favsRef.current = favs;
  const toggle = useCallback((ref: number) => {
    haptic("tap");
    if (!favsRef.current.includes(ref)) track("save", ref);
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

/** A small value kept in localStorage and Telegram CloudStorage (follows the user across devices). */
function useStored<T>(key: string, fallback: T): [T, (update: (current: T) => T) => void] {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setValue(JSON.parse(raw));
    } catch {
      // storage blocked
    }
    tg()?.CloudStorage?.getItem(key, (err, raw) => {
      if (err || !raw) return;
      try {
        setValue(JSON.parse(raw));
      } catch {
        // ignore
      }
    });
  }, [key]);
  const update = useCallback(
    (fn: (current: T) => T) =>
      setValue((current) => {
        const next = fn(current);
        const json = JSON.stringify(next);
        try {
          localStorage.setItem(key, json);
        } catch {
          // storage blocked
        }
        try {
          tg()?.CloudStorage?.setItem(key, json);
        } catch {
          // older clients
        }
        return next;
      }),
    [key],
  );
  return [value, update];
}

/** One line describing a saved search: "Rent · 2-комн. · ≤ $800 · Vake". */
function describeSearch(search: SavedSearch, lang: Lang, t: Dict): string {
  const f = search.filters;
  const places = f.districts.map((d) => placeName(d, lang));
  return [
    t[f.deal],
    f.rooms.length ? [...f.rooms].sort().map((r) => t.roomsChip(r)).join(", ") : "",
    f.priceMin ? `≥ $${f.priceMin}` : "",
    f.priceMax ? `≤ $${f.priceMax}` : "",
    places.length > 2 ? `${places.slice(0, 2).join(", ")} +${places.length - 2}` : places.join(", "),
    f.metro.length ? `Ⓜ ${f.metro.map((id) => metroName(id, lang)).join(", ")}` : f.nearMetro ? t.nearMetro : "",
    f.pets ? t.petsOk : "",
    f.near?.length ? f.near.map((k) => PLACE_EMOJI[k]).join("") : "",
    search.query ? `“${search.query}”` : "",
  ].filter(Boolean).join(" · ");
}

/** Language a channel link asks for: start param "p1001_ru_c" / "home_en", or ?lang= on the web. */
function linkLang(): Lang | null {
  const start = tg()?.initDataUnsafe?.start_param ?? new URLSearchParams(location.search).get("tgWebAppStartParam") ?? "";
  const value = start.match(/_(ka|en|ru)(_|$)/)?.[1] ?? new URLSearchParams(location.search).get("lang");
  return value === "ka" || value === "en" || value === "ru" ? value : null;
}

/** Where this visit came from, for the CRM stats page (lib/catalogEvents SOURCES). */
function visitSource(): string {
  const params = new URLSearchParams(location.search);
  const start = tg()?.initDataUnsafe?.start_param ?? params.get("tgWebAppStartParam") ?? "";
  const src = start.match(/_([casw])$/)?.[1] ?? params.get("src");
  const lang = start.match(/_(ka|en|ru)(_|$)/)?.[1] ?? params.get("lang") ?? "en";
  if (src === "a") return "alert";
  if (src === "s") return "share";
  if (src === "w") return "site";
  // Older channel posts carry no marker: a start param with a language came from a channel.
  if (src === "c" || /_(ka|en|ru)$/.test(start)) return `channel_${lang}`;
  return tg() ? "bot" : "web";
}

let visit = "web";
function track(kind: "open" | "view" | "save" | "share", ref?: number | null) {
  fetch("/api/catalog/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, ref: ref ?? undefined, source: visit }), keepalive: true }).catch(() => undefined);
}

/** Average sale price per m² (USD) by district, when at least 3 flats there have both. */
function areaAverages(items: CatalogItem[]): Map<string, number> {
  const sums = new Map<string, { total: number; n: number }>();
  for (const i of items) {
    if (i.kind !== "sale" || !i.district || !i.usd || !i.area || i.area < 15) continue;
    const s = sums.get(i.district) ?? { total: 0, n: 0 };
    s.total += i.usd / i.area;
    s.n += 1;
    sums.set(i.district, s);
  }
  return new Map([...sums].filter(([, s]) => s.n >= 3).map(([d, s]) => [d, s.total / s.n]));
}

/** "Good price": a sale flat at least 10% below its district's average per m². */
export function goodPrice(item: CatalogItem, averages: Map<string, number>): number | null {
  if (item.kind !== "sale" || item.closed || !item.district || !item.usd || !item.area) return null;
  const avg = averages.get(item.district);
  if (!avg) return null;
  const pct = Math.round((1 - item.usd / item.area / avg) * 100);
  return pct >= 10 ? pct : null;
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

export function CatalogApp({ items: allItems, agency, manager, phone, linkTemplate }: { items: CatalogItem[]; agency: string; manager: string | null; phone: string | null; linkTemplate: string }) {
  // Rented / sold flats only show on Home ("recently rented"), in their own page and in Saved.
  const items = useMemo(() => allItems.filter((i) => !i.closed), [allItems]);
  const closedItems = useMemo(() => allItems.filter((i) => i.closed), [allItems]);
  const averages = useMemo(() => areaAverages(allItems), [allItems]);
  const [lang, setLang] = useState<Lang>("en");
  const t = DICT[lang];
  const deals = useMemo(() => (["rent", "sale", "daily"] as DealKind[]).filter((d) => items.some((i) => i.kind === d)), [items]);
  const emptyFilters = useCallback((deal: DealKind): Filters => ({ deal, type: "", districts: [], priceMin: "", priceMax: "", rooms: [], areaMin: "", pets: false, features: [], nearMetro: false, metro: [], near: [] }), []);
  const [filters, setFilters] = useState<Filters>(() => emptyFilters(deals[0] ?? "rent"));
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [tab, setTabState] = useState<Tab>("home");
  // Tabs the user came through, so Back returns to the previous screen instead of closing the app.
  const tabRef = useRef<Tab>("home");
  const tabStack = useRef<Tab[]>([]);
  const setTab = useCallback((next: Tab) => {
    if (next === tabRef.current) return;
    tabStack.current = [...tabStack.current.filter((x) => x !== next), tabRef.current].slice(-10);
    tabRef.current = next;
    setTabState(next);
  }, []);
  const [dark, setDark] = useState(false);
  const [openRef, setOpenRef] = useState<number | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [mapSelected, setMapSelected] = useState<number | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [toast, setToast] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  // Hidden until the viewer's language is known, so it does not flash English first.
  const [ready, setReady] = useState(false);
  const { favs, toggle } = useFavorites();
  const [recent, setRecent] = useStored<number[]>("catalog_recent", []);
  const [searches, setSearches] = useStored<SavedSearch[]>("catalog_searches", []);
  // The map fills exactly the space between the header and the tab bar.
  const headerRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [chrome, setChrome] = useState({ top: 176, bottom: 64 });
  useEffect(() => {
    const measure = () => setChrome({ top: headerRef.current?.offsetHeight ?? 176, bottom: navRef.current?.offsetHeight ?? 64 });
    measure();
    const observer = new ResizeObserver(measure);
    if (headerRef.current) observer.observe(headerRef.current);
    if (navRef.current) observer.observe(navRef.current);
    return () => observer.disconnect();
  }, [tab, openRef]);

  // Telegram setup, language and the listing to open (?p=1023 or startapp=p1023).
  useEffect(() => {
    setLang(detectLang());
    setReady(true);
    const app = tg();
    if (app) {
      app.ready();
      app.expand();
      setDark(app.colorScheme === "dark");
      try {
        app.setHeaderColor?.("secondary_bg_color");
        app.setBackgroundColor?.("secondary_bg_color");
        // Ask before closing (users tapped "Close" when looking for Back), and
        // keep a swipe down on the map or a list from closing the app.
        app.enableClosingConfirmation?.();
        app.disableVerticalSwipes?.();
      } catch {
        // older clients
      }
    }
    const start = app?.initDataUnsafe?.start_param ?? new URLSearchParams(location.search).get("tgWebAppStartParam") ?? "";
    const fromUrl = new URLSearchParams(location.search).get("p");
    if (/^map(_|$)/.test(start) || new URLSearchParams(location.search).get("tab") === "map") setTab("map");
    const ref = Number(fromUrl ?? start.match(/^p(\d+)(_|$)/)?.[1] ?? 0);
    visit = visitSource();
    // One "open" per visit; with a flat it is a click on that flat's link (channel, alert, share).
    try {
      if (!sessionStorage.getItem("catalog_open")) {
        sessionStorage.setItem("catalog_open", "1");
        track("open", ref || null);
      }
    } catch {
      track("open", ref || null);
    }
    if (ref) track("view", ref);
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
  }, [setTab]);

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
    setRecent((list) => [ref, ...list.filter((r) => r !== ref)].slice(0, 20));
    track("view", ref);
  }, [setRecent]);

  // Back: sheet → listing → search → previous tab → Home.
  const canGoBack = Boolean(sheet || openRef || searching || tab !== "home");
  const closeTop = useCallback(() => {
    haptic("tap");
    if (sheet) setSheet(null);
    else if (openRef) {
      if (history.state?.p) history.back();
      else {
        setOpenRef(null);
        history.replaceState(null, "", location.pathname);
      }
    } else if (searching) setSearching(false);
    else if (tabRef.current !== "home") {
      const previous = tabStack.current.pop() ?? "home";
      tabRef.current = previous;
      setTabState(previous);
      setMapSelected(null);
      window.scrollTo({ top: 0 });
    }
  }, [sheet, openRef, searching]);

  // Telegram's own Back button (top left) does the same as ours.
  useEffect(() => {
    const back = tg()?.BackButton;
    if (!back) return;
    if (canGoBack) back.show();
    else back.hide();
    back.onClick(closeTop);
    return () => back.offClick(closeTop);
  }, [canGoBack, closeTop]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  // "Search this area" on the map: only flats inside those bounds (list and map), until cleared or the filters change.
  const [area, setArea] = useState<Bounds | null>(null);
  // Bumped when the area is cleared, so the map zooms back out to every flat.
  const [refit, setRefit] = useState(0);
  useEffect(() => setArea(null), [filters, query]);
  const results = useMemo(
    () => sortItems(items.filter((i) => matches(i, filters, query.trim(), lang) && (!area || (i.point != null && i.point.lat >= area.s && i.point.lat <= area.n && i.point.lng >= area.w && i.point.lng <= area.e))), sort),
    [items, filters, query, sort, lang, area],
  );
  const fitKey = useMemo(() => JSON.stringify([filters, query.trim(), refit]), [filters, query, refit]);
  // Map cards: west to east, so swiping moves across the map.
  const mapItems = useMemo(() => results.filter((i) => i.point).sort((a, b) => a.point!.lng - b.point!.lng), [results]);
  useEffect(() => setLimit(PAGE), [filters, query, sort]);
  const districts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) if (i.kind === filters.deal && i.district) counts.set(i.district, (counts.get(i.district) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [items, filters.deal]);
  const activeCount = [filters.type, filters.districts.length, filters.priceMin || filters.priceMax, filters.rooms.length, filters.areaMin, filters.pets, filters.features.length, filters.nearMetro, filters.metro.length, filters.near?.length].filter(Boolean).length;

  // In Telegram the bot prepares a card (photo, price, Open button) for Telegram's chat picker;
  // older clients and the web get the plain link.
  const share = async (item: CatalogItem) => {
    haptic("tap");
    track("share", item.ref);
    const link = linkTemplate.replace("{ref}", String(item.ref)).replace("{lang}", lang);
    const text = `${title(item, lang)} · ${priceText(item.price, item.currency, item.kind, lang)}`;
    const app = tg();
    if (app?.shareMessage) {
      const prepared = await fetch("/api/catalog/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: item.ref, lang, initData: app.initData }) })
        .then((r) => r.json() as Promise<{ ok: boolean; id?: string }>)
        .catch(() => null);
      if (prepared?.ok && prepared.id) {
        try {
          app.shareMessage(prepared.id, (sent) => sent && setToast(t.shareSent));
          return;
        } catch {
          // fall back to the link below
        }
      }
    }
    if (app) openTelegram(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
    else if (navigator.share) navigator.share({ url: link, text }).catch(() => undefined);
    else navigator.clipboard?.writeText(link).then(() => setToast(t.linkCopied));
  };
  const askManager = (item?: CatalogItem) => {
    if (!manager) return;
    const text = item ? `#${item.ref} — ${title(item, lang)}, ${priceText(item.price, item.currency, item.kind, lang)}` : "";
    openTelegram(text ? `${manager}?text=${encodeURIComponent(text)}` : manager);
  };

  const browse = (patch: Partial<Filters> & { deal: DealKind }) => {
    haptic("tap");
    setFilters({ ...emptyFilters(patch.deal), ...patch });
    setQuery("");
    setTab("list");
    window.scrollTo({ top: 0 });
  };
  const saveCurrentSearch = () => {
    const q = query.trim();
    if (searches.some((x) => x.query === q && JSON.stringify(x.filters) === JSON.stringify(filters))) {
      setToast(t.searchExists);
      return;
    }
    haptic("success");
    setSearches((list) => [{ id: Date.now().toString(36), filters, query: q, seen: Date.now() }, ...list].slice(0, 8));
    setToast(t.searchSaved);
  };
  const openSearch = (search: SavedSearch) => {
    haptic("tap");
    setFilters(search.filters);
    setQuery(search.query);
    setTab("list");
    setSearches((list) => list.map((x) => (x.id === search.id ? { ...x, seen: Date.now() } : x)));
    window.scrollTo({ top: 0 });
  };
  const removeSearch = (id: string) => setSearches((list) => list.filter((x) => x.id !== id));
  /** Turn a saved search into a bot alert (a "find me" request with the same criteria). */
  const notifySearch = async (search: SavedSearch) => {
    const app = tg();
    if (!app?.requestWriteAccess) return;
    const allowed = await new Promise<boolean>((resolve) => app.requestWriteAccess!((ok) => resolve(ok)));
    if (!allowed) return;
    const f = search.filters;
    const response = await fetch("/api/catalog/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "search",
        lang,
        initData: app.initData,
        message: describeSearch(search, lang, t),
        prefs: { deal: f.deal, budgetMax: num(f.priceMax) ?? undefined, roomsMin: f.rooms.length ? Math.min(...f.rooms) : undefined, areas: f.districts, pets: f.pets || undefined },
        alerts: true,
        source: visit,
      }),
    }).catch(() => null);
    if (response?.ok) {
      haptic("success");
      setSearches((list) => list.map((x) => (x.id === search.id ? { ...x, notify: true } : x)));
      setToast(t.notifyDone);
    } else setToast(t.errGeneric);
  };
  const searchProps: SearchProps = {
    searches,
    lang,
    t,
    describe: (x) => describeSearch(x, lang, t),
    countOf: (x) => items.filter((i) => matches(i, x.filters, x.query, lang)).length,
    freshOf: (x) => items.filter((i) => Date.parse(i.createdAt) > x.seen && matches(i, x.filters, x.query, lang)).length,
    onOpen: openSearch,
    onRemove: removeSearch,
    onNotify: notifySearch,
  };
  const recentItems = recent.map((ref) => allItems.find((i) => i.ref === ref)).filter(Boolean) as CatalogItem[];

  const openItemData = openRef ? allItems.find((i) => i.ref === openRef) ?? null : null;
  const savedItems = allItems.filter((i) => favs.includes(i.ref));

  return (
    <div
      data-catalog-root
      className={`min-h-screen bg-[var(--bg2)] text-[var(--text)] ${ready ? "" : "invisible"}`}
      style={
        {
          "--bg": "var(--tg-theme-section-bg-color, var(--tg-theme-bg-color, #ffffff))",
          "--bg2": "var(--tg-theme-secondary-bg-color, #f1f3f5)",
          "--text": "var(--tg-theme-text-color, #111827)",
          "--hint": "var(--tg-theme-hint-color, #6b7280)",
          "--line": "color-mix(in srgb, var(--hint) 25%, transparent)",
          // Brand: the navy and sky blue of the Tbilisi Buy & Rent logo (lighter blue on dark themes).
          "--accent": dark ? "#5b9bd8" : "#1d4f8c",
          "--navy": "#0e2a4d",
          "--sky": "#7fb0dc",
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
          onFindSimilar={(item) => { setOpenRef(null); history.replaceState(null, "", location.pathname); setFilters({ ...emptyFilters(item.kind), districts: item.district ? [item.district] : [] }); setTab("request"); }}
          averages={averages}
          phone={phone}
        />
      ) : (
        <div className="pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
          <header ref={headerRef} className="sticky top-0 z-20 space-y-2 bg-[var(--bg2)]/95 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
            <div className="flex items-center gap-2">
              {canGoBack ? (
                <button type="button" onClick={closeTop} aria-label={t.back} className="flex h-10 shrink-0 items-center gap-1 rounded-full bg-[var(--bg)] pl-2 pr-3 text-sm font-semibold text-[var(--accent)] shadow-sm active:scale-95">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                  {t.back}
                </button>
              ) : (
                // The logo file has a light square around the badge: zoom in so only the circle shows.
                <span className="h-10 w-10 shrink-0 overflow-hidden rounded-full shadow-md ring-2 ring-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/brand-logo.jpg" alt="Tbilisi Buy & Rent" className="h-full w-full scale-[1.22] object-cover" />
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-base font-extrabold tracking-tight text-[var(--text)]">{agency}</span>
              {tab === "list" || tab === "map" ? (
                <button type="button" aria-label={t.search} onClick={() => { haptic("tap"); setSearching(true); }} className={`flex h-10 w-10 items-center justify-center rounded-xl ${query ? "bg-[var(--accent)] text-white" : "bg-[var(--bg)] text-[var(--text)]"}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                </button>
              ) : null}
              <div className="flex rounded-lg bg-[var(--bg)] p-0.5 text-xs font-semibold">
                {(["ka", "en", "ru"] as Lang[]).map((l) => (
                  <button key={l} type="button" onClick={() => changeLang(l)} className={`min-h-9 rounded-md px-2.5 py-1.5 ${lang === l ? "bg-[var(--accent)] text-white" : "text-[var(--hint)]"}`}>{l.toUpperCase()}</button>
                ))}
              </div>
            </div>
            {searching && (tab === "list" || tab === "map") ? (
              <div className="flex items-center gap-2">
                <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-[var(--bg)] px-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-[var(--hint)]"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                  <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setSearching(false)} enterKeyHint="search" placeholder={t.homeSearch} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-[var(--hint)]" />
                  {query ? <button type="button" onClick={() => setQuery("")} className="text-[var(--hint)]" aria-label="clear">✕</button> : null}
                </label>
                <button type="button" onClick={() => setSearching(false)} className="shrink-0 text-sm font-semibold text-[var(--accent)]">{t.done}</button>
              </div>
            ) : null}
            {tab === "list" || tab === "map" ? (
              <div className="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {deals.length > 1 ? <Pill active label={`${DEAL_EMOJI[filters.deal]} ${t[filters.deal]}`} onClick={() => setSheet({ facet: "deal" })} /> : null}
                <button type="button" aria-label={t.filters} onClick={() => { haptic("tap"); setSheet("filters"); }} className={`relative flex h-10 shrink-0 items-center gap-1 rounded-full border px-3 text-sm font-medium ${activeCount ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--line)] bg-[var(--bg)]"}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
                  {activeCount ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[11px] font-bold text-white">{activeCount}</span> : null}
                </button>
                {query && !searching ? <Pill active onClick={() => setQuery("")} label={`“${query}” ✕`} plain /> : null}
                {area ? <Pill active onClick={() => { setArea(null); setRefit((n) => n + 1); }} label={`📍 ${t.thisArea} ✕`} plain /> : null}
                <Pill
                  active={Boolean(filters.priceMin || filters.priceMax)}
                  label={filters.priceMin || filters.priceMax ? priceRangeLabel(filters.priceMin, filters.priceMax) : t.pillPrice}
                  onClick={() => setSheet({ facet: "price" })}
                />
                <Pill
                  active={filters.rooms.length > 0}
                  label={filters.rooms.length ? t.roomsPill([...filters.rooms].sort().map((r) => (r === 4 ? "4+" : String(r))).join(", ")) : t.pillRooms}
                  onClick={() => setSheet({ facet: "rooms" })}
                />
                {districts.length > 1 ? (
                  <Pill
                    active={filters.districts.length > 0}
                    label={filters.districts.length ? `${placeName(filters.districts[0], lang)}${filters.districts.length > 1 ? ` +${filters.districts.length - 1}` : ""}` : t.pillDistrict}
                    onClick={() => setSheet({ facet: "district" })}
                  />
                ) : null}
                {/* Metro and pets live in Filters; here only while on, so an active filter is always visible. */}
                {filters.nearMetro || filters.metro.length > 0 ? (
                  <Pill
                    active={filters.nearMetro || filters.metro.length > 0}
                    label={filters.metro.length ? `Ⓜ ${metroName(filters.metro[0], lang)}${filters.metro.length > 1 ? ` +${filters.metro.length - 1}` : ""}` : filters.nearMetro ? t.nearMetro : t.pillMetro}
                    onClick={() => setSheet({ facet: "metro" })}
                  />
                ) : null}
                {filters.pets ? <Pill active label={`${t.petsOk} ✕`} onClick={() => setFilters((f) => ({ ...f, pets: false }))} plain /> : null}
                {filters.near?.length ? <Pill active label={`${filters.near.map((k) => PLACE_EMOJI[k]).join("")} ✕`} onClick={() => setFilters((f) => ({ ...f, near: [] }))} plain /> : null}
              </div>
            ) : null}
          </header>

          {tab === "home" ? (
            <Home
              items={items}
              closed={closedItems}
              deals={deals}
              lang={lang}
              t={t}
              recent={recentItems}
              searchProps={searchProps}
              onOpen={openItem}
              onBrowse={browse}
              onQuery={(q) => { setFilters(emptyFilters(deals[0] ?? "rent")); setQuery(q); setTab("list"); }}
              onMap={() => { haptic("select"); setTab("map"); }}
              onRequest={() => { haptic("select"); setTab("request"); }}
            />
          ) : null}

          {tab === "list" ? (
            <main className="space-y-3 px-3">
              <div className="flex items-center justify-between text-xs text-[var(--hint)]">
                <span className="flex items-center gap-2">
                  {t.found(results.length)}
                  {activeCount || query.trim() ? <button type="button" onClick={saveCurrentSearch} className="rounded-full bg-[var(--bg)] px-2.5 py-1 font-semibold text-[var(--accent)]">{t.saveSearch}</button> : null}
                </span>
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
                    <Card key={item.ref} item={item} lang={lang} t={t} fav={favs.includes(item.ref)} onFav={toggle} onOpen={openItem} good={goodPrice(item, averages)} />
                  ))}
                  {results.length > limit ? <More onMore={() => setLimit((l) => l + PAGE)} /> : null}
                </>
              )}
            </main>
          ) : null}

          {tab === "map" ? (
            <div className="fixed inset-x-0 z-10 overflow-hidden" style={{ top: chrome.top, bottom: chrome.bottom }}>
              <MapView
                items={results}
                selected={mapSelected}
                onSelect={setMapSelected}
                labels={{ ...t.mapLabels, metro: t.metroLayer, searchArea: t.searchArea }}
                dark={tg()?.colorScheme === "dark"}
                lang={lang}
                fitKey={fitKey}
                onSearchArea={(b) => { haptic("success"); setArea(b); setMapSelected(null); }}
                bottom={mapSelected ? 170 : 60}
              />
              {!results.some((i) => i.point) ? <div className="pointer-events-none absolute left-3 right-16 top-3 z-[500] rounded-xl bg-[var(--bg)] p-3 text-center text-sm text-[var(--hint)] shadow">{t.mapEmpty}</div> : null}
              {!mapSelected && results.some((i) => !i.point) ? (
                <button type="button" onClick={() => setTab("list")} className="absolute bottom-3 left-1/2 z-[500] -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--bg)] px-3 py-1.5 text-xs font-medium text-[var(--hint)] shadow-md">
                  📍 {t.notOnMap(results.filter((i) => !i.point).length)}
                </button>
              ) : null}
              {mapSelected && mapItems.some((i) => i.ref === mapSelected) ? (
                <MapCarousel items={mapItems} selected={mapSelected} onSelect={setMapSelected}>
                  {(item) => <Card item={item} lang={lang} t={t} fav={favs.includes(item.ref)} onFav={toggle} onOpen={openItem} compact />}
                </MapCarousel>
              ) : null}
            </div>
          ) : null}

          {tab === "saved" ? (
            <main className="space-y-3 px-3 pt-1">
              {searches.length ? <SearchList {...searchProps} /> : null}
              {recentItems.length ? <Row title={t.recentRow} items={recentItems} lang={lang} onOpen={openItem} t={t} /> : null}
              {savedItems.length === 0 ? (
                <div className="rounded-2xl bg-[var(--bg)] p-8 text-center text-sm text-[var(--hint)]">♡<br />{t.savedEmpty}</div>
              ) : (
                savedItems.map((item) => <Card key={item.ref} item={item} lang={lang} t={t} fav onFav={toggle} onOpen={openItem} good={goodPrice(item, averages)} />)
              )}
            </main>
          ) : null}

          {tab === "request" ? (
            <main className="px-3 pt-1">
              <div className="rounded-2xl bg-[var(--bg)] p-4">
                <h2 className="text-lg font-bold">{t.findTitle}</h2>
                <p className="mt-1 text-sm text-[var(--hint)]">{t.findText}</p>
                <LeadForm kind="search" lang={lang} t={t} districts={districts} defaultDeal={filters.deal} onDone={() => setTab("list")} />
              </div>
            </main>
          ) : null}

          {/* Floating tab bar: the active tab gets a blue pill, "Find me" is the raised round button in the middle. */}
          <nav ref={navRef} className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-3">
            <div className="pointer-events-auto mx-auto flex max-w-md items-end rounded-[26px] bg-[var(--bg)] px-1.5 pb-1.5 pt-1.5 shadow-[0_10px_30px_rgba(14,42,77,0.28)] ring-1 ring-[var(--line)]">
              {([
                ["home", t.tabHome, "M3 11l9-8 9 8M5 10v10h14V10"],
                ["list", t.tabList, "M4 6h16M4 12h16M4 18h10"],
                ["request", t.tabRequest, "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3M11 8v6M8 11h6"],
                ["map", t.tabMap, "M12 21s-7-6.5-7-11a7 7 0 1 1 14 0c0 4.5-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"],
                ["saved", t.tabSaved, "M12 20s-7-4.4-9-8.6C1.6 8.3 3.5 5 6.8 5c2 0 3.4 1.1 5.2 3 1.8-1.9 3.2-3 5.2-3 3.3 0 5.2 3.3 3.8 6.4C19 15.6 12 20 12 20z"],
              ] as [Tab, string, string][]).map(([value, label, icon]) => {
                const active = tab === value;
                const go = () => { haptic("select"); setTab(value); setMapSelected(null); setSearching(false); window.scrollTo({ top: 0 }); };
                if (value === "request") {
                  return (
                    <button key={value} type="button" onClick={go} className="flex flex-1 flex-col items-center gap-1">
                      <span className={`-mt-7 flex h-[58px] w-[58px] items-center justify-center rounded-full bg-gradient-to-br from-[#3a7dc4] to-[var(--navy)] text-white shadow-[0_8px_20px_rgba(14,42,77,0.45)] ring-4 ring-[var(--bg2)] transition-transform active:scale-90 ${active ? "scale-105" : ""}`}>
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
                      </span>
                      <span className={`text-[11px] font-bold ${active ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>{label}</span>
                    </button>
                  );
                }
                return (
                  <button key={value} type="button" onClick={go} className="flex flex-1 flex-col items-center gap-1 pt-1">
                    <span className={`relative flex h-8 w-14 items-center justify-center rounded-full transition-colors ${active ? "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)]" : "text-[var(--hint)]"}`}>
                      <svg width="23" height="23" viewBox="0 0 24 24" fill={active && value !== "list" ? "currentColor" : "none"} fillOpacity={value === "map" || value === "home" ? 0.18 : 1} stroke="currentColor" strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
                      {value === "saved" && favs.length ? <span className="absolute right-1.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white ring-2 ring-[var(--bg)]">{favs.length}</span> : null}
                    </span>
                    <span className={`text-[11px] ${active ? "font-bold text-[var(--accent)]" : "font-medium text-[var(--hint)]"}`}>{label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      )}

      {sheet && typeof sheet === "object" && "facet" in sheet ? (
        <BottomSheet onClose={() => setSheet(null)}>
          <FilterPanel only={sheet.facet} deals={deals} onDeal={(d) => { setFilters(emptyFilters(d)); setSheet(null); }} filters={filters} setFilters={setFilters} districts={districts} lang={lang} t={t} items={items} count={results.length} onReset={() => setFilters(emptyFilters(filters.deal))} onApply={() => { haptic("tap"); setSheet(null); }} />
        </BottomSheet>
      ) : null}
      {sheet === "filters" ? (
        <BottomSheet onClose={() => setSheet(null)}>
          <FilterPanel filters={filters} setFilters={setFilters} districts={districts} lang={lang} t={t} items={items} count={results.length} onReset={() => setFilters(emptyFilters(filters.deal))} onApply={() => { haptic("tap"); setSheet(null); }} />
        </BottomSheet>
      ) : null}
      {sheet && typeof sheet === "object" && "kind" in sheet ? (
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

function ClosedRibbon({ item, t }: { item: CatalogItem; t: Dict }) {
  if (!item.closed) return null;
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35">
      <span className="-rotate-6 rounded-lg border-2 border-white bg-[#0e2a4d]/90 px-3 py-1 text-sm font-black uppercase tracking-wider text-white shadow-lg">✓ {item.kind === "sale" ? t.sold : t.rented}</span>
    </span>
  );
}

/**
 * Swipeable cards at the bottom of the map, one per pin.  Swiping selects the
 * next flat (the map follows); tapping a pin scrolls to its card.
 */
function MapCarousel({ items, selected, onSelect, children }: { items: CatalogItem[]; selected: number; onSelect: (ref: number) => void; children: (item: CatalogItem) => React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const fromSwipe = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (fromSwipe.current) {
      fromSwipe.current = false;
      return;
    }
    const card = box.current?.querySelector<HTMLElement>(`[data-ref="${selected}"]`);
    if (card && box.current) box.current.scrollTo({ left: card.offsetLeft - (box.current.clientWidth - card.clientWidth) / 2, behavior: "smooth" });
  }, [selected]);

  const onScroll = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = box.current;
      if (!el) return;
      const middle = el.scrollLeft + el.clientWidth / 2;
      let best: HTMLElement | null = null;
      for (const card of el.querySelectorAll<HTMLElement>("[data-ref]")) {
        if (!best || Math.abs(card.offsetLeft + card.clientWidth / 2 - middle) < Math.abs(best.offsetLeft + best.clientWidth / 2 - middle)) best = card;
      }
      const ref = Number(best?.dataset.ref);
      if (ref && ref !== selected) {
        haptic("select");
        fromSwipe.current = true;
        onSelect(ref);
      }
    }, 120);
  };

  return (
    <div ref={box} onScroll={onScroll} className="absolute inset-x-0 bottom-3 z-[500] flex snap-x snap-mandatory scroll-px-3 gap-2 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((item) => (
        <div key={item.ref} data-ref={item.ref} className={`w-[86%] max-w-sm shrink-0 snap-center transition-opacity ${item.ref === selected ? "" : "opacity-80"}`}>
          {children(item)}
        </div>
      ))}
      {items.length > 1 ? <div className="w-[7%] shrink-0" aria-hidden /> : null}
    </div>
  );
}

function MiniCard({ item, lang, onOpen, t }: { item: CatalogItem; lang: Lang; onOpen: (ref: number) => void; t?: Dict }) {
  return (
    <button type="button" onClick={() => onOpen(item.ref)} className="w-40 shrink-0 snap-start overflow-hidden rounded-2xl bg-[var(--bg)] text-left shadow-sm">
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {item.photos[0] ? <img src={item.photos[0]} alt="" loading="lazy" className={`brand-ph h-28 w-full object-cover ${item.closed ? "grayscale-[60%]" : ""}`} /> : <div className="flex h-28 items-center justify-center bg-[var(--bg2)] text-2xl">🏠</div>}
        {t ? <ClosedRibbon item={item} t={t} /> : null}
      </div>
      <div className="p-2">
        <div className="text-sm font-bold">{shortPrice(item)}{item.kind === "rent" ? (lang === "ru" ? "/мес" : lang === "ka" ? "/თვე" : "/mo") : ""}</div>
        <div className="truncate text-xs text-[var(--hint)]">{title(item, lang)}{item.district ? ` · ${placeName(item.district, lang)}` : ""}</div>
      </div>
    </button>
  );
}

function Row({ title: heading, items, lang, onOpen, onMore, more, t }: { title: string; items: CatalogItem[]; lang: Lang; onOpen: (ref: number) => void; onMore?: () => void; more?: string; t?: Dict }) {
  if (!items.length) return null;
  return (
    <section>
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-sm font-bold">{heading}</h2>
        {onMore ? <button type="button" onClick={onMore} className="text-xs font-semibold text-[var(--accent)]">{more} ›</button> : null}
      </div>
      <div className="-mx-3 flex snap-x scroll-px-3 gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => <MiniCard key={item.ref} item={item} lang={lang} onOpen={onOpen} t={t} />)}
      </div>
    </section>
  );
}

type SearchProps = {
  searches: SavedSearch[];
  lang: Lang;
  t: Dict;
  describe: (s: SavedSearch) => string;
  countOf: (s: SavedSearch) => number;
  freshOf: (s: SavedSearch) => number;
  onOpen: (s: SavedSearch) => void;
  onRemove: (id: string) => void;
  onNotify: (s: SavedSearch) => void;
};

function SearchList({ searches, t, describe, countOf, freshOf, onOpen, onRemove, onNotify }: SearchProps) {
  const canNotify = Boolean(tg()?.requestWriteAccess);
  return (
    <section>
      <h2 className="mb-2 px-1 text-sm font-bold">{t.mySearches}</h2>
      <div className="space-y-2">
        {searches.map((search) => {
          const fresh = freshOf(search);
          return (
            <div key={search.id} className="flex items-center gap-2 rounded-2xl bg-[var(--bg)] p-3">
              <button type="button" onClick={() => onOpen(search)} className="min-w-0 flex-1 text-left">
                <div className="truncate text-sm font-semibold">{describe(search)}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--hint)]">
                  {t.found(countOf(search))}
                  {fresh ? <span className="rounded-full bg-[var(--accent)] px-1.5 py-px text-[10px] font-bold text-white">{t.newCount(fresh)}</span> : null}
                </div>
              </button>
              {canNotify ? (
                <button type="button" disabled={search.notify} onClick={() => onNotify(search)} className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${search.notify ? "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)]" : "bg-[var(--bg2)] text-[var(--text)]"}`}>
                  {search.notify ? t.notifyOn : t.notifySearch}
                </button>
              ) : null}
              <button type="button" onClick={() => onRemove(search.id)} aria-label="remove" className="shrink-0 px-1 text-[var(--hint)]">✕</button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const DEAL_EMOJI: Record<DealKind, string> = { rent: "🏠", sale: "🔑", daily: "📅" };

function Home({ items, closed, deals, lang, t, recent, searchProps, onOpen, onBrowse, onQuery, onMap, onRequest }: {
  items: CatalogItem[]; closed: CatalogItem[]; deals: DealKind[]; lang: Lang; t: Dict; recent: CatalogItem[]; searchProps: SearchProps;
  onOpen: (ref: number) => void; onBrowse: (patch: Partial<Filters> & { deal: DealKind }) => void; onQuery: (q: string) => void; onMap: () => void; onRequest: () => void;
}) {
  const [q, setQ] = useState("");
  const name = tg()?.initDataUnsafe?.user?.first_name ?? "";
  const main = deals[0] ?? "rent";
  const nearMetro = items.filter((i) => i.kind === main && i.metro.some((m) => m.minutes <= 10)).length;
  const pets = items.filter((i) => i.kind === "rent" && (i.pets === "yes" || i.pets === "ask")).length;
  const newest = [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 10);
  const popular = items.filter((i) => i.views > 0).sort((a, b) => b.views - a.views).slice(0, 10);
  const districts = useMemo(() => {
    const groups = new Map<string, CatalogItem[]>();
    for (const i of items) if (i.district) groups.set(i.district, [...(groups.get(i.district) ?? []), i]);
    return [...groups.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 6)
      .map(([district, list]) => {
        const deal = (["rent", "sale", "daily"] as DealKind[]).sort((a, b) => list.filter((i) => i.kind === b).length - list.filter((i) => i.kind === a).length)[0];
        const ofDeal = list.filter((i) => i.kind === deal && i.price != null);
        const cheapest = ofDeal.length ? ofDeal.reduce((a, b) => ((a.usd ?? 1e12) <= (b.usd ?? 1e12) ? a : b)) : null;
        return { district, deal, count: list.length, photo: list.find((i) => i.photos[0])?.photos[0] ?? null, cheapest };
      });
  }, [items]);
  const tile = "flex flex-col items-start gap-1 rounded-2xl bg-[var(--bg)] p-3 text-left shadow-sm active:scale-[0.98]";

  return (
    <main className="space-y-5 px-3 pb-4 pt-1">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--navy)] via-[#1d4f8c] to-[#4f8cc9] p-4 text-white shadow-[0_10px_30px_rgba(14,42,77,0.3)]">
        <span className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 overflow-hidden rounded-full opacity-30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand-logo.jpg" alt="" className="h-full w-full scale-[1.22] object-cover" />
        </span>
        <div className="relative text-xl font-extrabold">👋 {t.hello(name)}</div>
        <div className="relative mt-0.5 text-sm text-white/85">{t.homeSub(items.length)}</div>
        <form onSubmit={(e) => { e.preventDefault(); onQuery(q.trim()); }} className="relative mt-3 flex items-center gap-2 rounded-2xl bg-white px-3 text-gray-900 shadow-md">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-gray-400"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" placeholder={t.homeSearch} className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-gray-400" />
          {q ? <button type="submit" className="text-sm font-semibold text-[#1d4f8c]">→</button> : null}
        </form>
      </section>

      <section className="grid grid-cols-3 gap-2">
        {deals.map((d) => (
          <button key={d} type="button" onClick={() => onBrowse({ deal: d })} className={tile}>
            <span className="text-2xl">{DEAL_EMOJI[d]}</span>
            <span className="text-sm font-semibold">{t[d]}</span>
            <span className="text-xs text-[var(--hint)]">{items.filter((i) => i.kind === d).length}</span>
          </button>
        ))}
        {nearMetro ? (
          <button type="button" onClick={() => onBrowse({ deal: main, nearMetro: true })} className={tile}>
            <span className="text-2xl">🚇</span>
            <span className="text-sm font-semibold">{t.nearMetro.replace("🚇 ", "")}</span>
            <span className="text-xs text-[var(--hint)]">{nearMetro}</span>
          </button>
        ) : null}
        {pets ? (
          <button type="button" onClick={() => onBrowse({ deal: "rent", pets: true })} className={tile}>
            <span className="text-2xl">🐾</span>
            <span className="text-sm font-semibold">{t.petsOk.replace("🐾 ", "")}</span>
            <span className="text-xs text-[var(--hint)]">{pets}</span>
          </button>
        ) : null}
        <button type="button" onClick={onMap} className={tile}>
          <span className="text-2xl">🗺</span>
          <span className="text-sm font-semibold">{t.onMap.replace("🗺 ", "")}</span>
          <span className="text-xs text-[var(--hint)]">{items.filter((i) => i.point).length}</span>
        </button>
      </section>

      {searchProps.searches.length ? <SearchList {...searchProps} /> : null}
      <Row title={t.recentRow} items={recent.slice(0, 10)} lang={lang} onOpen={onOpen} t={t} />
      <Row title={t.newRow} items={newest} lang={lang} onOpen={onOpen} onMore={() => onBrowse({ deal: main })} more={t.seeAll} />
      {popular.length >= 3 ? <Row title={t.popularRow} items={popular} lang={lang} onOpen={onOpen} /> : null}
      {closed.length ? <Row title={t.closedRow} items={closed.slice(0, 10)} lang={lang} onOpen={onOpen} t={t} /> : null}

      {districts.length > 1 ? (
        <section>
          <h2 className="mb-2 px-1 text-sm font-bold">{t.districtsRow}</h2>
          <div className="grid grid-cols-2 gap-2">
            {districts.map((d) => (
              <button
                key={d.district}
                type="button"
                onClick={() => onBrowse({ deal: d.deal, districts: [d.district] })}
                className="relative h-24 overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--navy)] to-[#4f8cc9] bg-cover bg-center text-left shadow-sm active:scale-[0.98]"
                style={d.photo ? { backgroundImage: `url(${d.photo})` } : undefined}
              >
                <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
                <span className="absolute inset-x-2.5 bottom-2 text-white">
                  <span className="block truncate text-sm font-bold">{placeName(d.district, lang)}</span>
                  <span className="block text-[11px] text-white/85">{d.count}{d.cheapest ? ` · ${t.fromPrice(shortPrice(d.cheapest))}` : ""}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <button type="button" onClick={onRequest} className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-[var(--accent)] bg-[var(--bg)] p-4 text-left">
        <span className="text-3xl">🔎</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">{t.findCard}</span>
          <span className="block text-xs text-[var(--hint)]">{t.findCardText}</span>
        </span>
        <span className="text-[var(--accent)]">›</span>
      </button>
    </main>
  );
}

/** A filter button in the top bar: shows its value when set; plain ones toggle instead of opening a sheet. */
function Pill({ active, label, onClick, plain = false }: { active: boolean; label: string; onClick: () => void; plain?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => { haptic("select"); onClick(); }}
      className={`flex h-10 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium ${active ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] bg-[var(--bg)] text-[var(--text)]"}`}
    >
      {label}
      {plain ? null : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="opacity-70"><path d="m6 9 6 6 6-6" /></svg>}
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
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label="save" className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur">
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
          <img key={url} src={url} alt="" loading={i === 0 ? "eager" : "lazy"} draggable={false} className={`brand-ph ${height} w-full shrink-0 snap-center object-cover`} />
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

/** "Ⓜ Rustaveli · 5 min walk"; in the detail view every station within 15 minutes. */
function MetroBadge({ item, lang, t, small = false, all = false }: { item: CatalogItem; lang: Lang; t: Dict; small?: boolean; all?: boolean }) {
  const list = item.metro.filter((m) => m.minutes <= 15).slice(0, all ? 3 : 1);
  if (!list.length) return null;
  return (
    <div className={`flex flex-wrap gap-x-3 gap-y-1 ${small ? "text-xs" : "text-sm"}`}>
      {list.map((m) => {
        const station = METRO.find((s) => s.id === m.id)!;
        return (
          <span key={m.id} className="inline-flex items-center gap-1.5 text-[var(--hint)]">
            <span className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black text-white" style={{ background: METRO_LINE_COLOR[station.lines[0]] }}>M</span>
            <span className="truncate"><span className="text-[var(--text)]">{metroName(m.id, lang)}</span> · {t.walkMin(m.minutes)}</span>
          </span>
        );
      })}
    </div>
  );
}

/** "🛒 2 min · 🏫 4 min · 🌳 3 min": the nearest of the main kinds, for the map card. */
function NearbyLine({ item, t }: { item: CatalogItem; t: Dict }) {
  const list = (item.nearby ?? []).filter((n) => ["supermarket", "school", "kindergarten", "park", "pharmacy"].includes(n.kind) && n.minutes <= 15)
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    .slice(0, 4);
  if (!list.length) return null;
  return <div className="mt-0.5 truncate text-[11px] text-[var(--hint)]">{list.map((n) => `${PLACE_EMOJI[n.kind]} ${n.minutes} ${t.minShort}`).join(" · ")}</div>;
}

function Card({ item, lang, t, fav, onFav, onOpen, compact = false, good = null }: { item: CatalogItem; lang: Lang; t: Dict; fav: boolean; onFav: (ref: number) => void; onOpen: (ref: number) => void; compact?: boolean; good?: number | null }) {
  const place = placeName(item.location || item.district, lang);
  if (compact) {
    return (
      <button type="button" onClick={() => onOpen(item.ref)} className="flex w-full gap-3 overflow-hidden rounded-2xl bg-[var(--bg)] p-2 text-left shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {item.photos[0] ? <img src={item.photos[0]} alt="" className="brand-ph h-20 w-24 shrink-0 rounded-xl object-cover" /> : <div className="flex h-20 w-24 shrink-0 items-center justify-center rounded-xl bg-[var(--bg2)] text-2xl">🏠</div>}
        <div className="min-w-0 flex-1 py-0.5">
          <div className="text-base font-bold">{priceText(item.price, item.currency, item.kind, lang)}</div>
          <div className="truncate text-sm">{title(item, lang)}{item.area ? ` · ${item.area} ${m2(lang)}` : ""}</div>
          <div className="truncate text-xs text-[var(--hint)]">{place}</div>
          <MetroBadge item={item} lang={lang} t={t} small />
          <NearbyLine item={item} t={t} />
        </div>
        <span className="self-center pr-1 text-[var(--accent)]">›</span>
      </button>
    );
  }
  return (
    <article className="overflow-hidden rounded-2xl bg-[var(--bg)] shadow-sm">
      <div className="relative" onClick={() => onOpen(item.ref)}>
        <PhotoStrip photos={item.photos} t={t} height="h-56" />
        <ClosedRibbon item={item} t={t} />
        <div className="absolute left-2 top-2 flex gap-1">
          {isNew(item) && !item.closed ? <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[11px] font-bold text-white">{t.isNew}</span> : null}
          {item.availability === "reserved" ? <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white">{t.reserved}</span> : null}
          {good ? <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">💎 {t.goodPrice} −{good}%</span> : null}
          {item.video || item.tour ? <span className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white">{item.video ? "🎬" : ""}{item.tour ? "🧭" : ""}</span> : null}
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
        <MetroBadge item={item} lang={lang} t={t} />
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

function Detail({ item, items, lang, t, fav, onFav, onOpen, onBack, onViewing, onAsk, onShare, onFindSimilar, averages, phone }: {
  item: CatalogItem | null; items: CatalogItem[]; lang: Lang; t: Dict; fav: boolean; onFav: (ref: number) => void; onOpen: (ref: number) => void; onBack: () => void;
  onViewing: (ref: number) => void; onAsk: (item?: CatalogItem) => void; onShare: (item: CatalogItem) => void; onFindSimilar: (item: CatalogItem) => void;
  averages: Map<string, number>; phone: string | null;
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
  const perM2 = item.kind === "sale" && item.usd && item.area ? Math.round(item.usd / item.area) : null;
  const avgM2 = item.kind === "sale" && item.district ? averages.get(item.district) ?? null : null;
  const good = goodPrice(item, averages);
  const description = item.description[lang];
  // Same deal; scored by district, price within 25%, same rooms and a shared metro station.
  const similar = items
    .filter((i) => i.ref !== item.ref && i.kind === item.kind && !i.closed)
    .map((i) => {
      let score = 0;
      if (item.district && i.district === item.district) score += 3;
      if (item.usd && i.usd && Math.abs(i.usd - item.usd) / item.usd < 0.25) score += 2;
      if (item.rooms && i.rooms === item.rooms) score += 1;
      if (i.metro.some((m) => m.minutes <= 15 && item.metro.some((n) => n.id === m.id && n.minutes <= 15))) score += 1;
      return { i, score };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => x.i);
  const rows = [
    [t.rooms, item.rooms],
    [t.bedrooms, item.bedrooms],
    [t.baths, item.bathrooms],
    [t.area, item.area ? `${item.area} ${m2(lang)}` : null],
    [t.floor, item.floor ? `${item.floor}${item.totalFloors ? ` / ${item.totalFloors}` : ""}` : null],
    [t.perM2, perM2 ? `$${perM2.toLocaleString("en-US")}` : null],
    [t.areaAvg(placeName(item.district, lang)), avgM2 ? `$${Math.round(avgM2).toLocaleString("en-US")}` : null],
    [t.term, item.kind === "rent" && item.leaseTerm ? termText(item.leaseTerm, lang) : null],
    [t.condition, item.condition && lang === "ka" ? item.condition : null],
    [t.type, typeLabel(item.type, lang)],
  ].filter(([, v]) => v != null && v !== "") as [string, string | number][];

  return (
    <div className="pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <div className="relative">
        <MediaGallery key={item.ref} item={item} t={t} />
        {item.closed ? <ClosedRibbon item={item} t={t} /> : null}
        <div className="absolute inset-x-2 top-[max(0.5rem,env(safe-area-inset-top))] flex justify-between">
          <button type="button" onClick={onBack} className="flex h-10 items-center gap-1 rounded-full bg-black/50 pl-2 pr-3 text-sm font-semibold text-white backdrop-blur active:scale-95" aria-label={t.back}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            {t.back}
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={() => onShare(item)} aria-label={t.share} className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur">
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
            {item.closed ? <span className="rounded-full bg-[#0e2a4d] px-2 py-0.5 font-bold text-white">✓ {item.kind === "sale" ? t.sold : t.rented}</span> : null}
          </div>
          <div className={`text-2xl font-bold ${item.closed ? "text-[var(--hint)] line-through decoration-2" : ""}`}>{priceText(item.price, item.currency, item.kind, lang)}</div>
          {good ? (
            <div className="inline-flex items-center gap-1.5 rounded-xl bg-[color-mix(in_srgb,#059669_14%,var(--bg))] px-2.5 py-1.5 text-xs font-semibold text-[color-mix(in_srgb,#059669_75%,var(--text))]">
              💎 {t.goodPrice} · {t.goodPriceHint(good, placeName(item.district, lang))}
            </div>
          ) : null}
          <h1 className="text-base font-semibold">{title(item, lang)}{item.area ? `, ${item.area} ${m2(lang)}` : ""}</h1>
          {place ? <div className="text-sm text-[var(--hint)]">📍 {place}</div> : null}
          <MetroBadge item={item} lang={lang} t={t} all />
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

        {item.closed ? (
          <section className="rounded-2xl bg-[color-mix(in_srgb,var(--accent)_10%,var(--bg))] p-4 text-sm">
            <p>{t.closedNote}</p>
            <button type="button" onClick={() => { haptic("tap"); onFindSimilar(item); }} className="mt-3 w-full rounded-xl bg-[var(--accent)] py-3 font-semibold text-white">🔎 {t.findSimilar}</button>
          </section>
        ) : null}

        <NearbySection item={item} lang={lang} t={t} />

        {similar.length ? (
          <section>
            <h2 className="mb-2 px-1 text-sm font-semibold">{t.similar}</h2>
            <div className="-mx-3 flex snap-x scroll-px-3 gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {similar.map((s) => (
                <button key={s.ref} type="button" onClick={() => onOpen(s.ref)} className="w-44 shrink-0 snap-start overflow-hidden rounded-2xl bg-[var(--bg)] text-left">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {s.photos[0] ? <img src={s.photos[0]} alt="" loading="lazy" className="brand-ph h-28 w-full object-cover" /> : <div className="flex h-28 items-center justify-center bg-[var(--bg2)] text-2xl">🏠</div>}
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
        {item.closed ? (
          <button type="button" onClick={() => { haptic("tap"); onFindSimilar(item); }} className="flex-1 rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white">🔎 {t.findSimilar}</button>
        ) : (
          <button type="button" onClick={() => { haptic("tap"); onViewing(item.ref); }} className="flex-1 rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white">{t.requestViewing}</button>
        )}
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
    <button type="button" onClick={() => { haptic("select"); onClick(); }} className={`min-h-10 rounded-full border px-3.5 py-2 text-sm ${active ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)]"}`}>
      {children}
    </button>
  );
}

/** The full filter sheet, or with "only" a small sheet for one filter from the top bar. */
function FilterPanel({ only, deals = [], onDeal, filters, setFilters, districts, lang, t, items, count, onReset, onApply }: {
  only?: Facet; deals?: DealKind[]; onDeal?: (deal: DealKind) => void; filters: Filters; setFilters: React.Dispatch<React.SetStateAction<Filters>>; districts: string[]; lang: Lang; t: Dict; items: CatalogItem[]; count: number; onReset: () => void; onApply: () => void;
}) {
  const show = (facet: Facet) => !only || only === facet;
  const heading = only ? { deal: t.pillDeal, price: t.pillPrice, rooms: t.pillRooms, district: t.pillDistrict, metro: t.pillMetro }[only] : t.filters;
  if (only === "deal") {
    return (
      <div className="space-y-2">
        <h2 className="mb-3 text-lg font-bold">{heading}</h2>
        {deals.map((d) => (
          <button key={d} type="button" onClick={() => { haptic("select"); onDeal?.(d); }} className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left ${filters.deal === d ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : "border-[var(--line)]"}`}>
            <span className="text-2xl">{DEAL_EMOJI[d]}</span>
            <span className="flex-1 text-base font-semibold">{t[d]}</span>
            <span className="text-sm text-[var(--hint)]">{items.filter((i) => i.kind === d).length}</span>
            {filters.deal === d ? <span className="text-[var(--accent)]">✓</span> : null}
          </button>
        ))}
      </div>
    );
  }
  const resetThis = () => {
    if (!only) return onReset();
    setFilters((f) => ({
      ...f,
      ...(only === "price" ? { priceMin: "", priceMax: "" } : {}),
      ...(only === "rooms" ? { rooms: [] } : {}),
      ...(only === "district" ? { districts: [] } : {}),
      ...(only === "metro" ? { nearMetro: false, metro: [] } : {}),
    }));
  };
  const types = [...new Set(items.filter((i) => i.kind === filters.deal).map((i) => i.type ?? "ბინა"))];
  // Only stations that have a listing of this deal type within 15 minutes.
  const stations = METRO.filter((st) => items.some((i) => i.kind === filters.deal && i.metro.some((m) => m.id === st.id && m.minutes <= 15)));
  // Only kinds some flat of this deal type is near, so no chip ever gives an empty list.
  const nearKinds = KIND_ORDER.filter((k) => items.some((i) => i.kind === filters.deal && i.nearby?.some((n) => n.kind === k && n.minutes <= NEAR_MINUTES)));
  const toggleIn = <K extends "districts" | "features" | "metro">(key: K, value: string) =>
    setFilters((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value] }));
  const box = "w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]";
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{heading}</h2>
        <button type="button" onClick={resetThis} className="text-sm text-[var(--accent)]">{t.reset}</button>
      </div>
      {!only && types.length > 1 ? (
        <div>
          <div className="mb-1.5 text-xs font-medium text-[var(--hint)]">{t.type}</div>
          <div className="flex flex-wrap gap-1.5">
            <ChipToggle active={!filters.type} onClick={() => setFilters((f) => ({ ...f, type: "" }))}>{t.any}</ChipToggle>
            {types.map((type) => <ChipToggle key={type} active={filters.type === type} onClick={() => setFilters((f) => ({ ...f, type }))}>{typeLabel(type, lang)}</ChipToggle>)}
          </div>
        </div>
      ) : null}
      {show("price") ? (
      <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {PRICE_PRESETS[filters.deal].map(([min, max]) => (
          <ChipToggle key={`${min}-${max}`} active={filters.priceMin === min && filters.priceMax === max} onClick={() => setFilters((f) => (f.priceMin === min && f.priceMax === max ? { ...f, priceMin: "", priceMax: "" } : { ...f, priceMin: min, priceMax: max }))}>
            {priceRangeLabel(min, max)}
          </ChipToggle>
        ))}
      </div>
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
      </div>
      ) : null}
      {show("rooms") ? (
      <div>
        {only ? null : <div className="mb-1.5 text-xs font-medium text-[var(--hint)]">{t.rooms}</div>}
        <div className="grid grid-cols-4 gap-1.5">
          {[1, 2, 3, 4].map((r) => (
            <button key={r} type="button" onClick={() => { haptic("select"); setFilters((f) => ({ ...f, rooms: f.rooms.includes(r) ? f.rooms.filter((x) => x !== r) : [...f.rooms, r] })); }} className={`rounded-xl border py-3 text-center ${filters.rooms.includes(r) ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)]"}`}>
              <span className="block text-lg font-bold">{r === 4 ? "4+" : r}</span>
              <span className="block text-[11px] opacity-80">{t.rooms}</span>
            </button>
          ))}
        </div>
      </div>
      ) : null}
      {!only ? (
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[var(--hint)]">{t.areaMin}</span>
        <input inputMode="numeric" value={filters.areaMin} onChange={(e) => setFilters((f) => ({ ...f, areaMin: e.target.value }))} className={box} />
      </label>
      ) : null}
      {show("district") && districts.length ? (
        <div>
          <div className="mb-1.5 text-xs font-medium text-[var(--hint)]">{t.districts}</div>
          <div className="flex flex-wrap gap-1.5">
            {districts.map((d) => <ChipToggle key={d} active={filters.districts.includes(d)} onClick={() => toggleIn("districts", d)}>{placeName(d, lang)}</ChipToggle>)}
          </div>
        </div>
      ) : null}
      {show("metro") && stations.length ? (
        <div>
          <div className="mb-1.5 text-xs font-medium text-[var(--hint)]">{t.metroFilter}</div>
          <div className="flex flex-wrap gap-1.5">
            <ChipToggle active={filters.nearMetro} onClick={() => setFilters((f) => ({ ...f, nearMetro: !f.nearMetro }))}>{t.nearMetro}</ChipToggle>
            {stations.map((st) => (
              <ChipToggle key={st.id} active={filters.metro.includes(st.id)} onClick={() => toggleIn("metro", st.id)}>
                <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: METRO_LINE_COLOR[st.lines[0]] }} />
                {st.name[lang]}
              </ChipToggle>
            ))}
          </div>
        </div>
      ) : null}
      {!only && nearKinds.length ? (
        <div>
          <div className="mb-1.5 text-xs font-medium text-[var(--hint)]">{t.nearFilter(NEAR_MINUTES)}</div>
          <div className="flex flex-wrap gap-1.5">
            {nearKinds.map((k) => (
              <ChipToggle key={k} active={Boolean(filters.near?.includes(k))} onClick={() => setFilters((f) => ({ ...f, near: f.near?.includes(k) ? f.near.filter((x) => x !== k) : [...(f.near ?? []), k] }))}>
                {PLACE_EMOJI[k]} {t.places[k]}
              </ChipToggle>
            ))}
          </div>
        </div>
      ) : null}
      {!only ? (
      <div>
        <div className="mb-1.5 text-xs font-medium text-[var(--hint)]">{t.features}</div>
        <div className="flex flex-wrap gap-1.5">
          {filters.deal !== "sale" ? <ChipToggle active={filters.pets} onClick={() => setFilters((f) => ({ ...f, pets: !f.pets }))}>{t.petsOk}</ChipToggle> : null}
          {FEATURES.filter((f) => items.some((i) => i.features.includes(f.key))).map((f) => (
            <ChipToggle key={f.key} active={filters.features.includes(f.key)} onClick={() => toggleIn("features", f.key)}>{f.emoji} {f[lang]}</ChipToggle>
          ))}
        </div>
      </div>
      ) : null}
      <button type="button" onClick={onApply} className="sticky bottom-0 w-full rounded-xl bg-[var(--accent)] py-3.5 text-sm font-semibold text-white shadow-lg">{t.show(count)}</button>
    </div>
  );
}

type Criteria = {
  deal: DealKind; types: string[]; budgetMin: string; budgetMax: string; rooms: number | null; bedrooms: number | null; bathrooms: number | null;
  areaMin: string; areaMax: string; districts: string[]; nearMetro: boolean; metro: string[]; notFirstFloor: boolean; notLastFloor: boolean;
  features: string[]; pets: boolean; term: string; moveIn: string;
};
const EMPTY_CRITERIA: Criteria = {
  deal: "rent", types: [], budgetMin: "", budgetMax: "", rooms: null, bedrooms: null, bathrooms: null, areaMin: "", areaMax: "",
  districts: [], nearMetro: false, metro: [], notFirstFloor: false, notLastFloor: false, features: [], pets: false, term: "", moveIn: "",
};

/** "Rooms from: [1+] [2+] [3+] …" — tap again to clear. */
function CountRow({ label, value, options, onChange }: { label: string; value: number | null; options: number[]; onChange: (v: number | null) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-xs font-medium text-[var(--hint)]">{label}</span>
      <div className="flex flex-1 gap-1.5">
        {options.map((n) => (
          <button key={n} type="button" onClick={() => onChange(value === n ? null : n)} className={`h-9 flex-1 rounded-xl border text-sm font-semibold ${value === n ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)]"}`}>{n}+</button>
        ))}
      </div>
    </div>
  );
}

function LeadForm({ kind, item, lang, t, districts = [], defaultDeal, onDone }: {
  kind: "viewing" | "question" | "search"; item?: CatalogItem; lang: Lang; t: Dict; districts?: string[]; deals?: DealKind[]; defaultDeal?: DealKind; onDone: () => void;
}) {
  const app = tg();
  const user = app?.initDataUnsafe?.user;
  const [name, setName] = useState([user?.first_name, user?.last_name].filter(Boolean).join(" "));
  const [phone, setPhone] = useState("");
  const [when, setWhen] = useState("");
  const [message, setMessage] = useState("");
  const [c, setC] = useState<Criteria>(() => ({ ...EMPTY_CRITERIA, deal: defaultDeal ?? "rent" }));
  const set = <K extends keyof Criteria>(key: K, value: Criteria[K]) => { haptic("select"); setC((cur) => ({ ...cur, [key]: value })); };
  const toggleList = (key: "types" | "districts" | "metro" | "features", value: string) =>
    set(key, c[key].includes(value) ? c[key].filter((x) => x !== value) : [...c[key], value]);
  const [more, setMore] = useState(false);
  const [allDistricts, setAllDistricts] = useState(false);
  const [stationsOpen, setStationsOpen] = useState(false);
  // Every Tbilisi district, the ones with listings first.
  const districtList = [...new Set([...districts, ...TBILISI_DISTRICTS])];
  const [alerts, setAlerts] = useState(true);
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
    // Alerts need the user's permission for the bot to write to them.
    const allowed = kind === "search" && alerts && app?.requestWriteAccess ? await new Promise<boolean>((resolve) => app.requestWriteAccess!((ok) => resolve(ok))) : false;
    const parts = [when ? `${t.when} ${when}` : "", message].filter(Boolean);
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
          prefs: kind === "search"
            ? {
                deal: c.deal,
                types: c.types,
                budgetMin: num(c.budgetMin) ?? undefined,
                budgetMax: num(c.budgetMax) ?? undefined,
                roomsMin: c.rooms ?? undefined,
                bedroomsMin: c.bedrooms ?? undefined,
                bathroomsMin: c.bathrooms ?? undefined,
                areaMin: num(c.areaMin) ?? undefined,
                areaMax: num(c.areaMax) ?? undefined,
                areas: c.districts,
                nearMetro: c.nearMetro || undefined,
                metro: c.metro,
                notFirstFloor: c.notFirstFloor || undefined,
                notLastFloor: c.notLastFloor || undefined,
                features: c.features,
                pets: c.pets || undefined,
                leaseTerm: c.deal === "rent" && c.term ? c.term : undefined,
                moveIn: c.moveIn || undefined,
              }
            : undefined,
          alerts: allowed,
          source: visit,
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
          {/* 1. What */}
          <section className="space-y-3 rounded-2xl border border-[var(--line)] p-3">
            <h3 className="text-sm font-bold">🏠 {t.critWhat}</h3>
            <div className="grid grid-cols-3 gap-1.5">
              {(["rent", "sale", "daily"] as DealKind[]).map((d) => (
                <button key={d} type="button" onClick={() => set("deal", d)} className={`rounded-xl border py-2.5 text-sm font-semibold ${c.deal === d ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)]"}`}>{t[d]}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PROPERTY_TYPES.map((type) => <ChipToggle key={type} active={c.types.includes(type)} onClick={() => toggleList("types", type)}>{typeLabel(type, lang)}</ChipToggle>)}
            </div>
            <CountRow label={t.roomsMin} value={c.rooms} options={[1, 2, 3, 4, 5]} onChange={(v) => set("rooms", v)} />
            <CountRow label={t.bedroomsMin} value={c.bedrooms} options={[1, 2, 3, 4]} onChange={(v) => set("bedrooms", v)} />
            <CountRow label={t.bathsMin} value={c.bathrooms} options={[1, 2, 3]} onChange={(v) => set("bathrooms", v)} />
          </section>

          {/* 2. Budget */}
          <section className="space-y-2 rounded-2xl border border-[var(--line)] p-3">
            <h3 className="text-sm font-bold">💰 {t.critBudget}</h3>
            <div className="grid grid-cols-2 gap-2">
              <input inputMode="numeric" value={c.budgetMin} onChange={(e) => setC((cur) => ({ ...cur, budgetMin: e.target.value }))} placeholder={t.fromLabel} className={box} />
              <input inputMode="numeric" value={c.budgetMax} onChange={(e) => setC((cur) => ({ ...cur, budgetMax: e.target.value }))} placeholder={t.toLabel} className={box} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRICE_PRESETS[c.deal].map(([min, max]) => (
                <ChipToggle key={`${min}-${max}`} active={c.budgetMin === min && c.budgetMax === max} onClick={() => setC((cur) => (cur.budgetMin === min && cur.budgetMax === max ? { ...cur, budgetMin: "", budgetMax: "" } : { ...cur, budgetMin: min, budgetMax: max }))}>
                  {priceRangeLabel(min, max)}
                </ChipToggle>
              ))}
            </div>
          </section>

          {/* 3. Where */}
          <section className="space-y-2 rounded-2xl border border-[var(--line)] p-3">
            <h3 className="text-sm font-bold">📍 {t.critWhere}</h3>
            <div className="flex flex-wrap gap-1.5">
              {(allDistricts ? districtList : districtList.slice(0, 10)).map((d) => <ChipToggle key={d} active={c.districts.includes(d)} onClick={() => toggleList("districts", d)}>{placeName(d, lang)}</ChipToggle>)}
              {districtList.length > 10 ? (
                <button type="button" onClick={() => setAllDistricts((v) => !v)} className="rounded-full px-3 py-1.5 text-sm font-semibold text-[var(--accent)]">{allDistricts ? t.showLess : t.showAll(districtList.length)}</button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--line)] pt-2">
              <ChipToggle active={c.nearMetro} onClick={() => set("nearMetro", !c.nearMetro)}>{t.nearMetro}</ChipToggle>
              <button type="button" onClick={() => setStationsOpen((v) => !v)} className="rounded-full px-3 py-1.5 text-sm font-semibold text-[var(--accent)]">
                Ⓜ {t.chooseStations}{c.metro.length ? ` (${c.metro.length})` : ""} {stationsOpen ? "▴" : "▾"}
              </button>
            </div>
            {stationsOpen ? (
              <div className="flex flex-wrap gap-1.5">
                {METRO.map((st) => (
                  <ChipToggle key={st.id} active={c.metro.includes(st.id)} onClick={() => toggleList("metro", st.id)}>
                    <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: METRO_LINE_COLOR[st.lines[0]] }} />
                    {st.name[lang]}
                  </ChipToggle>
                ))}
              </div>
            ) : null}
          </section>

          {/* 4. More (folded) */}
          <button type="button" onClick={() => { haptic("tap"); setMore((v) => !v); }} className="flex w-full items-center justify-between rounded-2xl bg-[var(--bg2)] px-3 py-3 text-sm font-semibold">
            <span>⚙️ {more ? t.lessCriteria : t.moreCriteria}</span>
            <span className="text-[var(--hint)]">{more ? "▴" : "▾"}</span>
          </button>
          {more ? (
            <section className="space-y-3 rounded-2xl border border-[var(--line)] p-3">
              <div>
                <div className="mb-1 text-xs font-medium text-[var(--hint)]">{t.areaRange}</div>
                <div className="grid grid-cols-2 gap-2">
                  <input inputMode="numeric" value={c.areaMin} onChange={(e) => setC((cur) => ({ ...cur, areaMin: e.target.value }))} placeholder={t.fromLabel} className={box} />
                  <input inputMode="numeric" value={c.areaMax} onChange={(e) => setC((cur) => ({ ...cur, areaMax: e.target.value }))} placeholder={t.toLabel} className={box} />
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-xs font-medium text-[var(--hint)]">{t.floor}</div>
                <div className="flex flex-wrap gap-1.5">
                  <ChipToggle active={c.notFirstFloor} onClick={() => set("notFirstFloor", !c.notFirstFloor)}>{t.notFirstFloor}</ChipToggle>
                  <ChipToggle active={c.notLastFloor} onClick={() => set("notLastFloor", !c.notLastFloor)}>{t.notLastFloor}</ChipToggle>
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-xs font-medium text-[var(--hint)]">{t.features}</div>
                <div className="flex flex-wrap gap-1.5">
                  {c.deal !== "sale" ? <ChipToggle active={c.pets} onClick={() => set("pets", !c.pets)}>{t.petsOk}</ChipToggle> : null}
                  {FEATURES.map((f) => <ChipToggle key={f.key} active={c.features.includes(f.key)} onClick={() => toggleList("features", f.key)}>{f.emoji} {f[lang]}</ChipToggle>)}
                </div>
              </div>
              {c.deal === "rent" ? (
                <div>
                  <div className="mb-1.5 text-xs font-medium text-[var(--hint)]">{t.stayTerm}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {LEASE_TERMS.map((term) => <ChipToggle key={term} active={c.term === term} onClick={() => set("term", c.term === term ? "" : term)}>{termText(term, lang)}</ChipToggle>)}
                  </div>
                </div>
              ) : null}
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--hint)]">{t.moveIn}</span>
                <input type="date" value={c.moveIn} onChange={(e) => setC((cur) => ({ ...cur, moveIn: e.target.value }))} className={box} />
              </label>
            </section>
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
      {kind === "search" && app?.requestWriteAccess ? (
        <label className="flex items-start gap-2.5 rounded-xl bg-[var(--bg2)] p-3 text-sm">
          <input type="checkbox" checked={alerts} onChange={(e) => setAlerts(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
          <span>
            <span className="font-semibold">{t.alertsLabel}</span>
            <span className="mt-0.5 block text-xs text-[var(--hint)]">{t.alertsHint}</span>
          </span>
        </label>
      ) : null}
      {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
      <button type="submit" disabled={state === "sending"} className="w-full rounded-xl bg-[var(--accent)] py-3.5 text-sm font-semibold text-white disabled:opacity-60">{state === "sending" ? t.sending : t.send}</button>
    </form>
  );
}
