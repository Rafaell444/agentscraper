"use client";

import { useEffect, useRef, useState } from "react";
import type { CatalogItem, DealKind } from "@/lib/catalog";

// Leaflet + marker clustering, loaded from a CDN only when the map tab opens.
// Pins are photo "pills" coloured by deal type; nearby flats group into
// clusters showing the count and the lowest price.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Lf = any;

const LEAFLET = "https://unpkg.com/leaflet@1.9.4/dist/leaflet";
const CLUSTER = "https://unpkg.com/leaflet.markercluster@1.5.3/dist";
let loading: Promise<Lf> | null = null;

function addScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(src));
    document.head.appendChild(script);
  });
}

function addCss(href: string) {
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = href;
  document.head.appendChild(css);
}

function loadLeaflet(): Promise<Lf> {
  const w = window as unknown as { L?: Lf };
  if (w.L?.markerClusterGroup) return Promise.resolve(w.L);
  if (!loading) {
    addCss(`${LEAFLET}.css`);
    addCss(`${CLUSTER}/MarkerCluster.css`);
    loading = addScript(`${LEAFLET}.js`)
      .then(() => addScript(`${CLUSTER}/leaflet.markercluster.js`))
      .then(() => w.L)
      .catch((error) => {
        loading = null;
        throw error;
      });
  }
  return loading;
}

export function shortPrice(item: Pick<CatalogItem, "price" | "currency">): string {
  if (item.price == null) return "•";
  const sym = item.currency === "GEL" ? "₾" : "$";
  const v = item.price;
  const n = v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : v >= 10_000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(Math.round(v));
  return `${sym}${n}`;
}

const KIND_COLOR: Record<DealKind, string> = { rent: "#059669", sale: "#4f46e5", daily: "#ea580c" };

const STYLE = `
.mp{position:relative;width:max-content;transform:translate(-50%,calc(-100% - 7px));display:flex;align-items:center;gap:5px;padding:2px 10px 2px 2px;border-radius:999px;background:#fff;color:#111;border:2px solid var(--k);box-shadow:0 3px 10px rgba(0,0,0,.28);font:700 12.5px/1 system-ui,-apple-system,sans-serif;white-space:nowrap;cursor:pointer;transition:transform .15s ease,background .15s ease}
.mp::after{content:"";position:absolute;left:50%;bottom:-7px;width:10px;height:10px;background:inherit;border-right:2px solid var(--k);border-bottom:2px solid var(--k);transform:translateX(-50%) rotate(45deg);border-bottom-right-radius:2px}
.mp i{display:block;width:26px;height:26px;border-radius:50%;background:var(--k) center/cover no-repeat;flex:none}
.mp i.e{display:flex;align-items:center;justify-content:center;color:#fff;font-style:normal;font-size:13px}
.mp:hover{transform:translate(-50%,calc(-100% - 7px)) scale(1.06)}
.mp.on{background:var(--k);color:#fff;transform:translate(-50%,calc(-100% - 7px)) scale(1.18);box-shadow:0 0 0 6px color-mix(in srgb,var(--k) 25%,transparent),0 6px 16px rgba(0,0,0,.35);animation:mp-pop .35s ease}
.mp.on i{box-shadow:0 0 0 2px #fff}
@keyframes mp-pop{0%{transform:translate(-50%,calc(-100% - 7px)) scale(.9)}60%{transform:translate(-50%,calc(-100% - 7px)) scale(1.25)}100%{transform:translate(-50%,calc(-100% - 7px)) scale(1.18)}}
.mc{display:flex;flex-direction:column;align-items:center;width:max-content;transform:translate(-50%,-50%);cursor:pointer}
.mc b{display:flex;align-items:center;justify-content:center;border-radius:50%;color:#fff;font:800 14px system-ui,sans-serif;background:radial-gradient(circle at 30% 30%,#34d399,#047857);box-shadow:0 0 0 5px rgba(5,150,105,.25),0 0 0 10px rgba(5,150,105,.12),0 4px 12px rgba(0,0,0,.3)}
.mc span{margin-top:6px;padding:2px 7px;border-radius:999px;background:#fff;color:#065f46;font:700 11px system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.25);white-space:nowrap}
.me{width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,.25);transform:translate(-50%,-50%)}
.leaflet-container{background:#e5e7eb;font-family:system-ui,sans-serif}
`;

export type LayerKey = "streets" | "satellite" | "terrain" | "dark";

const LAYERS: Record<LayerKey, { url: string; max: number; attribution: string; labels?: string }> = {
  streets: { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", max: 19, attribution: "© OpenStreetMap" },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    max: 19,
    attribution: "© Esri",
    labels: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  },
  terrain: { url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", max: 17, attribution: "© OpenStreetMap © OpenTopoMap" },
  dark: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    max: 16,
    attribution: "© Esri",
    labels: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
  },
};

function pinHtml(item: CatalogItem, active: boolean): string {
  const photo = item.photos[0];
  const thumb = photo ? `<i style="background-image:url('${photo}')"></i>` : `<i class="e">🏠</i>`;
  return `<div class="mp${active ? " on" : ""}" style="--k:${KIND_COLOR[item.kind]}">${thumb}${shortPrice(item)}</div>`;
}

export type MapLabels = { layers: Record<LayerKey, string>; locate: string; fit: string; from: string };

export function MapView({ items, selected, onSelect, labels, dark }: { items: CatalogItem[]; selected: number | null; onSelect: (ref: number | null) => void; labels: MapLabels; dark: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const lib = useRef<Lf>(null);
  const map = useRef<Lf>(null);
  const cluster = useRef<Lf>(null);
  const tiles = useRef<Lf[]>([]);
  const area = useRef<Lf>(null);
  const me = useRef<Lf>(null);
  const markers = useRef(new Map<number, Lf>());
  const select = useRef(onSelect);
  select.current = onSelect;
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [layer, setLayer] = useState<LayerKey>(() => {
    try {
      const saved = localStorage.getItem("catalog_layer") as LayerKey | null;
      if (saved && saved in LAYERS) return saved;
    } catch {
      // storage blocked
    }
    return dark ? "dark" : "streets";
  });
  const [picker, setPicker] = useState(false);
  const points = items.filter((i) => i.point);
  const key = points.map((i) => i.ref).join(",");

  const fit = () => {
    const L = lib.current;
    if (!L || !map.current) return;
    if (points.length) map.current.fitBounds(L.latLngBounds(points.map((i) => [i.point!.lat, i.point!.lng])), { padding: [50, 50], maxZoom: 15 });
    else map.current.setView([41.7151, 44.8271], 12);
  };

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    if (!document.getElementById("catalog-map-style")) {
      const style = document.createElement("style");
      style.id = "catalog-map-style";
      style.textContent = STYLE;
      document.head.appendChild(style);
    }
    loadLeaflet()
      .then((L) => {
        if (cancelled || !box.current) return;
        lib.current = L;
        const m = L.map(box.current, { zoomControl: false, attributionControl: true });
        m.attributionControl.setPrefix(false);
        map.current = m;
        m.on("click", () => select.current(null));
        cluster.current = L.markerClusterGroup({
          maxClusterRadius: 55,
          showCoverageOnHover: false,
          spiderfyOnMaxZoom: true,
          spiderLegPolylineOptions: { weight: 1.5, color: "#059669", opacity: 0.6 },
          iconCreateFunction: (group: Lf) => {
            const children = group.getAllChildMarkers() as Lf[];
            const prices = children.map((c) => c.options.item as CatalogItem).filter((i) => i.price != null);
            const cheapest = prices.length ? prices.reduce((a, b) => ((a.usd ?? a.price!) <= (b.usd ?? b.price!) ? a : b)) : null;
            const count = group.getChildCount();
            const size = count < 10 ? 38 : count < 50 ? 46 : 54;
            return L.divIcon({
              className: "",
              iconSize: [0, 0],
              html: `<div class="mc"><b style="width:${size}px;height:${size}px">${count}</b>${cheapest ? `<span>${labels.from.replace("{p}", shortPrice(cheapest))}</span>` : ""}</div>`,
            });
          },
        });
        m.addLayer(cluster.current);
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Base layer.
  useEffect(() => {
    const L = lib.current;
    if (!ready || !L || !map.current) return;
    for (const t of tiles.current) map.current.removeLayer(t);
    const spec = LAYERS[layer];
    tiles.current = [L.tileLayer(spec.url, { maxZoom: 19, maxNativeZoom: spec.max, attribution: spec.attribution, subdomains: "abc" }).addTo(map.current)];
    if (spec.labels) tiles.current.push(L.tileLayer(spec.labels, { maxZoom: 19, maxNativeZoom: spec.max, pane: "overlayPane" }).addTo(map.current));
    try {
      localStorage.setItem("catalog_layer", layer);
    } catch {
      // storage blocked
    }
  }, [layer, ready]);

  // Markers whenever the filtered list changes.
  useEffect(() => {
    const L = lib.current;
    if (!ready || !L || !cluster.current) return;
    cluster.current.clearLayers();
    markers.current.clear();
    const list = points.map((item) => {
      const marker = L.marker([item.point!.lat, item.point!.lng], { icon: L.divIcon({ className: "", iconSize: [0, 0], html: pinHtml(item, item.ref === selected) }), item });
      marker.on("click", () => select.current(item.ref));
      markers.current.set(item.ref, marker);
      return marker;
    });
    cluster.current.addLayers(list);
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);

  // Highlight the selected pin; an approximate location gets a soft circle.
  useEffect(() => {
    const L = lib.current;
    if (!ready || !L || !map.current) return;
    for (const item of points) {
      const marker = markers.current.get(item.ref);
      marker?.setIcon(L.divIcon({ className: "", iconSize: [0, 0], html: pinHtml(item, item.ref === selected) }));
      marker?.setZIndexOffset(item.ref === selected ? 1000 : 0);
    }
    area.current?.remove();
    area.current = null;
    const item = points.find((i) => i.ref === selected);
    // Keep the chosen pin above the listing card at the bottom.
    if (item) {
      const at = map.current.latLngToContainerPoint([item.point!.lat, item.point!.lng]);
      const height = map.current.getSize().y;
      if (at.y > height - 190) map.current.panBy([0, at.y - height * 0.45]);
    }
    if (item && !item.point!.exact) {
      area.current = L.circle([item.point!.lat, item.point!.lng], { radius: 350, color: KIND_COLOR[item.kind], weight: 1.5, fillOpacity: 0.12, interactive: false }).addTo(map.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, key, ready]);

  const locate = () => {
    const L = lib.current;
    if (!L || !map.current || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const at: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        me.current?.remove();
        me.current = L.marker(at, { icon: L.divIcon({ className: "", iconSize: [0, 0], html: '<div class="me"></div>' }), interactive: false }).addTo(map.current);
        map.current.setView(at, 15);
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  if (failed) return <div className="p-6 text-center text-sm text-[var(--hint)]">Map could not load.</div>;
  const btn = "flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg)] text-[var(--text)] shadow-md active:scale-95";
  return (
    <div className="relative h-full w-full">
      <div ref={box} className="h-full w-full" />
      <div className="absolute right-3 top-3 z-[600] flex flex-col gap-2">
        <button type="button" aria-label="layers" onClick={() => setPicker((v) => !v)} className={btn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 3 2 8.5 12 14l10-5.5L12 3z" /><path d="m2 13.5 10 5.5 10-5.5" /></svg>
        </button>
        <button type="button" aria-label={labels.locate} onClick={locate} className={btn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
        </button>
        <button type="button" aria-label={labels.fit} onClick={fit} className={btn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
        </button>
      </div>
      {picker ? (
        <div className="absolute right-16 top-3 z-[600] grid grid-cols-2 gap-2 rounded-2xl bg-[var(--bg)] p-2 shadow-lg">
          {(Object.keys(LAYERS) as LayerKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setLayer(k);
                setPicker(false);
              }}
              className={`flex w-[84px] flex-col items-center gap-1 rounded-xl p-1.5 text-[11px] font-semibold ${layer === k ? "bg-[var(--accent)] text-white" : "text-[var(--text)]"}`}
            >
              <span className="block h-12 w-full rounded-lg bg-cover bg-center" style={{ backgroundImage: `url(${LAYERS[k].url.replace("{s}", "a").replace("{z}", "13").replace("{x}", "5116").replace("{y}", "3049")})` }} />
              {labels.layers[k]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
