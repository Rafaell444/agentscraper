"use client";

import { useEffect, useRef, useState } from "react";
import type { CatalogItem } from "@/lib/catalog";

// Leaflet + OpenStreetMap, loaded from a CDN only when the map tab opens.

type Marker = { setIcon: (icon: unknown) => void; setZIndexOffset: (n: number) => void; on: (e: string, cb: () => void) => Marker; addTo: (m: unknown) => Marker };
type LeafletMap = { remove: () => void; fitBounds: (b: unknown, o?: unknown) => void; setView: (c: [number, number], z: number) => void; on: (e: string, cb: () => void) => void };
type Leaflet = {
  map: (el: HTMLElement, o?: unknown) => LeafletMap;
  tileLayer: (url: string, o?: unknown) => { addTo: (m: unknown) => void };
  divIcon: (o: unknown) => unknown;
  marker: (c: [number, number], o?: unknown) => Marker;
  latLngBounds: (c: [number, number][]) => unknown;
};

const LEAFLET = "https://unpkg.com/leaflet@1.9.4/dist/leaflet";
let loading: Promise<Leaflet> | null = null;

function loadLeaflet(): Promise<Leaflet> {
  const w = window as unknown as { L?: Leaflet };
  if (w.L) return Promise.resolve(w.L);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = `${LEAFLET}.css`;
      document.head.appendChild(css);
      const script = document.createElement("script");
      script.src = `${LEAFLET}.js`;
      script.onload = () => (w.L ? resolve(w.L) : reject(new Error("leaflet")));
      script.onerror = () => {
        loading = null;
        reject(new Error("leaflet"));
      };
      document.head.appendChild(script);
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

function pin(L: Leaflet, item: CatalogItem, active: boolean) {
  return L.divIcon({
    className: "",
    iconSize: [0, 0],
    html: `<div style="transform:translate(-50%,-100%);white-space:nowrap;padding:3px 8px;border-radius:999px;font:600 12px system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.3);background:${active ? "#059669" : "#fff"};color:${active ? "#fff" : "#111"};border:1px solid ${active ? "#047857" : "#d1d5db"}">${shortPrice(item)}</div>`,
  });
}

export function MapView({ items, selected, onSelect }: { items: CatalogItem[]; selected: number | null; onSelect: (ref: number | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const lib = useRef<Leaflet | null>(null);
  const markers = useRef(new Map<number, Marker>());
  const select = useRef(onSelect);
  select.current = onSelect;
  const [failed, setFailed] = useState(false);
  const points = items.filter((i) => i.point);
  const key = points.map((i) => i.ref).join(",");

  useEffect(() => {
    let map: LeafletMap | null = null;
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !box.current) return;
        lib.current = L;
        const m = L.map(box.current, { zoomControl: false });
        map = m;
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
        m.on("click", () => select.current(null));
        markers.current.clear();
        for (const item of points) {
          const marker = L.marker([item.point!.lat, item.point!.lng], { icon: pin(L, item, false) }).addTo(m).on("click", () => select.current(item.ref));
          markers.current.set(item.ref, marker);
        }
        if (points.length) m.fitBounds(L.latLngBounds(points.map((i) => [i.point!.lat, i.point!.lng])), { padding: [40, 40], maxZoom: 15 });
        else m.setView([41.7151, 44.8271], 12);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Highlight the selected pin without moving the map.
  useEffect(() => {
    const L = lib.current;
    if (!L) return;
    for (const item of points) {
      const marker = markers.current.get(item.ref);
      marker?.setIcon(pin(L, item, item.ref === selected));
      marker?.setZIndexOffset(item.ref === selected ? 1000 : 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, key]);

  if (failed) return <div className="p-6 text-center text-sm text-[var(--hint)]">Map could not load.</div>;
  return <div ref={box} className="h-full w-full" />;
}
