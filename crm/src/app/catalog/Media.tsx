"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { placeName, type CatalogItem, type Lang } from "@/lib/catalog";
import type { Dict } from "./i18n";
import { loadLeaflet, vectorLayer } from "./MapView";
import { haptic } from "./tg";
import { KIND_ORDER, PLACE_COLOR, PLACE_EMOJI, fetchNearby, placeHtml } from "./places";

// The listing's media: photos, floor plans, a video and a 3D tour, with a
// full-screen viewer that zooms (pinch, double tap, mouse wheel) — the mini
// app viewport blocks the browser's own pinch zoom.

type Mode = "photos" | "plans" | "video" | "tour";

export function MediaGallery({ item, t }: { item: CatalogItem; t: Dict }) {
  const modes = ([
    ["photos", item.photos.length > 0],
    ["plans", item.plans.length > 0],
    ["video", Boolean(item.video)],
    ["tour", Boolean(item.tour)],
  ] as [Mode, boolean][]).filter(([, has]) => has).map(([m]) => m);
  const [mode, setMode] = useState<Mode>(modes[0] ?? "photos");
  const [open, setOpen] = useState<number | null>(null);
  const urls = mode === "plans" ? item.plans : item.photos;
  const label: Record<Mode, string> = {
    photos: `📷 ${t.tabPhotos}${item.photos.length > 1 ? ` ${item.photos.length}` : ""}`,
    plans: `📐 ${t.tabPlan}`,
    video: `🎬 ${t.tabVideo}`,
    tour: `🧭 ${t.tabTour}`,
  };

  return (
    <div className="relative bg-[#0b1626]">
      {mode === "photos" || mode === "plans" ? (
        <Strip key={mode} urls={urls} t={t} contain={mode === "plans"} onOpen={setOpen} />
      ) : mode === "video" && item.video ? (
        <div className="flex h-[360px] items-center justify-center bg-black">
          {item.video.kind === "video" ? (
            <video src={item.video.src} controls playsInline className="h-full max-w-full" />
          ) : (
            <iframe
              title="video"
              src={item.video.src}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              className={item.video.vertical ? "h-full aspect-[9/16]" : "aspect-video w-full"}
            />
          )}
        </div>
      ) : mode === "tour" && item.tour ? (
        <iframe title="3D tour" src={item.tour} allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer" allowFullScreen className="h-[360px] w-full border-0" />
      ) : (
        <div className="flex h-[300px] items-center justify-center text-5xl">🏠</div>
      )}

      {modes.length > 1 ? (
        <div className="absolute inset-x-0 bottom-3 flex justify-center">
          <div className="flex gap-1 rounded-full bg-black/55 p-1 backdrop-blur">
            {modes.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { haptic("select"); setMode(m); }}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${mode === m ? "bg-white text-[#0e2a4d]" : "text-white/90"}`}
              >
                {label[m]}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {open !== null ? <Lightbox urls={urls} start={open} t={t} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function Strip({ urls, t, contain, onOpen }: { urls: string[]; t: Dict; contain: boolean; onOpen: (i: number) => void }) {
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <>
      <div ref={strip} className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {urls.map((url, i) => (
          <button key={url} type="button" onClick={() => { haptic("tap"); onOpen(i); }} className="w-full shrink-0 snap-center" aria-label={t.photosOf(i + 1, urls.length)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" draggable={false} loading={i < 2 ? "eager" : "lazy"} className={`h-[360px] w-full ${contain ? "bg-white object-contain" : "brand-ph object-cover"}`} />
          </button>
        ))}
      </div>
      <span className="pointer-events-none absolute right-3 top-[calc(max(0.5rem,env(safe-area-inset-top))+2.75rem)] rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white">
        {urls.length > 1 ? `${t.photosOf(index + 1, urls.length)} · ` : ""}⤢
      </span>
    </>
  );
}

/** Full-screen viewer: swipe between photos, pinch / double tap to zoom, drag to pan, swipe down to close. */
function Lightbox({ urls, start, t, onClose }: { urls: string[]; start: number; t: Dict; onClose: () => void }) {
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(start);
  const [zoomed, setZoomed] = useState(false);
  const [drag, setDrag] = useState(0);

  const goTo = useCallback((i: number, smooth = true) => {
    const el = strip.current;
    if (!el) return;
    el.scrollTo({ left: Math.max(0, Math.min(urls.length - 1, i)) * el.clientWidth, behavior: smooth ? "smooth" : "auto" });
  }, [urls.length]);

  useEffect(() => {
    goTo(start, false);
    const el = strip.current;
    const onScroll = () => el && setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el?.addEventListener("scroll", onScroll, { passive: true });
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      el?.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [goTo, start, onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black" style={{ backgroundColor: `rgba(0,0,0,${1 - Math.min(0.6, Math.abs(drag) / 400)})` }} role="dialog" aria-modal="true">
      <div className="flex items-center justify-between px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">{t.photosOf(index + 1, urls.length)}</span>
        <button type="button" onClick={onClose} aria-label={t.close} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-2xl leading-none">×</button>
      </div>
      <div ref={strip} className={`flex min-h-0 flex-1 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${zoomed ? "overflow-hidden" : "overflow-x-auto"}`}>
        {urls.map((url, i) => (
          <div key={url} className="relative h-full w-full shrink-0 snap-center overflow-hidden">
            <ZoomImage src={url} active={i === index} onZoom={setZoomed} onDrag={setDrag} onClose={onClose} />
          </div>
        ))}
      </div>
      {urls.length > 1 ? (
        <>
          <button type="button" onClick={() => goTo(index - 1)} aria-label="‹" className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-2xl text-white sm:flex">‹</button>
          <button type="button" onClick={() => goTo(index + 1)} aria-label="›" className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-2xl text-white sm:flex">›</button>
          <div className="flex gap-1.5 overflow-x-auto px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {urls.map((url, i) => (
              <button key={url} type="button" onClick={() => goTo(i)} className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-2 transition ${i === index ? "ring-white" : "opacity-50 ring-transparent"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" loading="lazy" className="brand-ph h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </>
      ) : null}
      {!zoomed ? <p className="pointer-events-none absolute inset-x-0 top-[calc(max(0.75rem,env(safe-area-inset-top))+3rem)] text-center text-[11px] text-white/60">{t.zoomHint}</p> : null}
    </div>
  );
}

type View = { scale: number; x: number; y: number };

function ZoomImage({ src, active, onZoom, onDrag, onClose }: { src: string; active: boolean; onZoom: (z: boolean) => void; onDrag: (dy: number) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [moving, setMoving] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;

  // Reset when the user swipes to another photo.
  useEffect(() => {
    if (!active) setView({ scale: 1, x: 0, y: 0 });
  }, [active]);
  useEffect(() => {
    if (active) onZoom(view.scale > 1.01);
  }, [active, view.scale, onZoom]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const clamp = (v: View): View => {
      const maxX = ((v.scale - 1) * el.clientWidth) / 2;
      const maxY = ((v.scale - 1) * el.clientHeight) / 2;
      return { scale: v.scale, x: Math.max(-maxX, Math.min(maxX, v.x)), y: Math.max(-maxY, Math.min(maxY, v.y)) };
    };
    const zoomAt = (clientX: number, clientY: number, scale: number) => {
      const rect = el.getBoundingClientRect();
      const cx = clientX - rect.left - rect.width / 2;
      const cy = clientY - rect.top - rect.height / 2;
      const v = viewRef.current;
      const next = Math.max(1, Math.min(4, scale));
      // Keep the point under the finger in place.
      const ratio = next / v.scale;
      setView(clamp({ scale: next, x: cx - (cx - v.x) * ratio, y: cy - (cy - v.y) * ratio }));
    };

    let pinch: { dist: number; scale: number; midX: number; midY: number; x: number; y: number } | null = null;
    let pan: { x: number; y: number; vx: number; vy: number; dir: "" | "h" | "v" } | null = null;
    let lastTap = 0;
    let tapMoved = false;
    let dragY = 0;

    const dist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const onStart = (e: TouchEvent) => {
      tapMoved = false;
      if (e.touches.length === 2) {
        const [a, b] = [e.touches[0], e.touches[1]];
        const v = viewRef.current;
        pinch = { dist: dist(a, b), scale: v.scale, midX: (a.clientX + b.clientX) / 2, midY: (a.clientY + b.clientY) / 2, x: v.x, y: v.y };
        pan = null;
        setMoving(true);
      } else if (e.touches.length === 1) {
        const v = viewRef.current;
        pan = { x: e.touches[0].clientX, y: e.touches[0].clientY, vx: v.x, vy: v.y, dir: "" };
        setMoving(true);
      }
    };
    const onMove = (e: TouchEvent) => {
      if (pinch && e.touches.length === 2) {
        e.preventDefault();
        tapMoved = true;
        const [a, b] = [e.touches[0], e.touches[1]];
        const scale = Math.max(1, Math.min(4, (pinch.scale * dist(a, b)) / pinch.dist));
        const midX = (a.clientX + b.clientX) / 2;
        const midY = (a.clientY + b.clientY) / 2;
        setView(clamp({ scale, x: pinch.x + (midX - pinch.midX), y: pinch.y + (midY - pinch.midY) }));
        return;
      }
      if (!pan || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - pan.x;
      const dy = e.touches[0].clientY - pan.y;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) tapMoved = true;
      if (viewRef.current.scale > 1.01) {
        e.preventDefault();
        setView(clamp({ scale: viewRef.current.scale, x: pan.vx + dx, y: pan.vy + dy }));
        return;
      }
      // Not zoomed: sideways is the photo strip (native scroll), downwards closes.
      if (!pan.dir && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) pan.dir = Math.abs(dy) > Math.abs(dx) ? "v" : "h";
      if (pan.dir === "v") {
        e.preventDefault();
        dragY = dy;
        onDrag(dy);
        setView({ scale: 1, x: 0, y: dy });
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length > 0) return;
      setMoving(false);
      if (pan?.dir === "v") {
        if (Math.abs(dragY) > 110) onClose();
        else setView({ scale: 1, x: 0, y: 0 });
        onDrag(0);
        dragY = 0;
      } else if (viewRef.current.scale < 1.05) {
        setView({ scale: 1, x: 0, y: 0 });
      }
      // Double tap: zoom in to 2.5× there, or back out.
      if (!tapMoved && !pinch) {
        const now = Date.now();
        const touch = e.changedTouches[0];
        if (now - lastTap < 300) {
          haptic("tap");
          if (viewRef.current.scale > 1.01) setView({ scale: 1, x: 0, y: 0 });
          else zoomAt(touch.clientX, touch.clientY, 2.5);
          lastTap = 0;
        } else lastTap = now;
      }
      pinch = null;
      pan = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, viewRef.current.scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2));
    };
    const onDouble = (e: MouseEvent) => {
      if (viewRef.current.scale > 1.01) setView({ scale: 1, x: 0, y: 0 });
      else zoomAt(e.clientX, e.clientY, 2.5);
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("dblclick", onDouble);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("dblclick", onDouble);
    };
  }, [onClose, onDrag]);

  return (
    <div ref={box} className="flex h-full w-full items-center justify-center" style={{ touchAction: view.scale > 1.01 ? "none" : "pan-x" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        draggable={false}
        className="max-h-full max-w-full select-none object-contain"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transition: moving ? "none" : "transform .2s ease-out" }}
      />
    </div>
  );
}

// ------------------------------------------------------------------ nearby ---

type Place = { kind: string; name: Record<Lang, string>; lat: number; lng: number; minutes: number };
type Nearby = { center: { lat: number; lng: number }; places: Place[] };
type Point = { lat: number; lng: number };

const NO_PLACES: Place[] = [];
const ZOOM_TITLES: Record<Lang, { zoomInTitle: string; zoomOutTitle: string }> = {
  en: { zoomInTitle: "Zoom in", zoomOutTitle: "Zoom out" },
  ru: { zoomInTitle: "Приблизить", zoomOutTitle: "Отдалить" },
  ka: { zoomInTitle: "მიახლოება", zoomOutTitle: "დაშორება" },
};

/** The place name in the reader's script: a Georgian-only name is written in Latin / Cyrillic letters. */
function placeLabel(p: Place, lang: Lang): string {
  const name = p.name[lang] || p.name.ka;
  return lang !== "ka" && /[Ⴀ-ჿ]/.test(name) ? placeName(name, lang) : name;
}

const homeHtml = `<div style="width:36px;height:36px;border-radius:50%;background:#1d4f8c;border:3px solid #fff;box-shadow:0 0 0 7px rgba(29,79,140,.22),0 3px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:17px;transform:translate(-50%,-50%)">🏠</div>`;

/**
 * The flat and the places around it.  As a preview (interactive=false) it does
 * not catch the finger, so the page scrolls over it; full screen it pans,
 * pinch-zooms and has zoom buttons.
 */
function PlacesMap({ center, exact, places, selected, interactive, onSelect, recenter = 0, lang }: {
  lang: Lang; center: Point; exact: boolean; places: Place[]; selected?: Place | null; interactive: boolean; onSelect?: (p: Place | null) => void; recenter?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const map = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !box.current) return;
      const m = L.map(box.current, {
        maxZoom: 19,
        zoomControl: false,
        attributionControl: false,
        dragging: interactive,
        touchZoom: interactive,
        doubleClickZoom: interactive,
        scrollWheelZoom: interactive,
        boxZoom: false,
        keyboard: interactive,
        tap: interactive,
      });
      if (interactive) L.control.zoom({ position: "bottomright", ...ZOOM_TITLES[lang] }).addTo(m);
      // Street names in the app language (vector map); OSM pictures if that is not available.
      vectorLayer(L, "liberty", lang).then((gl) => {
        if (cancelled) return;
        (gl ?? L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 })).addTo(m);
      });
      L.marker([center.lat, center.lng], { icon: L.divIcon({ className: "", html: homeHtml, iconSize: [0, 0] }), zIndexOffset: 1000, interactive: false }).addTo(m);
      if (!exact) L.circle([center.lat, center.lng], { radius: 300, color: "#1d4f8c", weight: 1, fillOpacity: 0.08, interactive: false }).addTo(m);
      if (interactive) m.on("click", () => selectRef.current?.(null));
      m.setView([center.lat, center.lng], 15);
      layer.current = L.layerGroup().addTo(m);
      map.current = m;
      setReady(true);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [center.lat, center.lng, exact, interactive, lang]);

  // Markers for the places shown; the view fits them (and the flat).
  useEffect(() => {
    const L = (window as unknown as { L?: { divIcon: (o: object) => unknown; marker: (ll: number[], o: object) => { on: (e: string, f: () => void) => { addTo: (g: unknown) => void }; addTo: (g: unknown) => void } } }).L;
    if (!ready || !L || !layer.current) return;
    layer.current.clearLayers();
    for (const p of places) {
      const on = selected === p;
      const marker = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: "", html: placeHtml(p.kind, on), iconSize: [0, 0] }), zIndexOffset: on ? 900 : 0, interactive });
      if (interactive) marker.on("click", () => selectRef.current?.(p)).addTo(layer.current);
      else marker.addTo(layer.current);
    }
  }, [ready, places, selected, interactive]);

  useEffect(() => {
    if (!ready || !map.current) return;
    map.current.invalidateSize();
    const bounds = [[center.lat, center.lng], ...places.map((p) => [p.lat, p.lng])];
    if (bounds.length > 1) map.current.fitBounds(bounds, { padding: [36, 36], maxZoom: 16, animate: interactive });
    else map.current.setView([center.lat, center.lng], 15);
    // Fit again only when the set of places changes, not on selection.
  }, [ready, places, recenter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ready && selected && map.current) map.current.panTo([selected.lat, selected.lng], { animate: true });
  }, [ready, selected]);

  // isolate: Leaflet's panes (z-index 400+) stay inside this box instead of covering overlays.
  return <div ref={box} className="isolate h-full w-full" />;
}

/** Full-screen map: kind chips on top, the tapped place in a card at the bottom. Back closes it. */
function MapScreen({ center, exact, places, kinds, startKind, lang, t, onClose }: {
  center: Point; exact: boolean; places: Place[]; kinds: string[]; startKind: string | null; lang: Lang; t: Dict; onClose: () => void;
}) {
  const [kind, setKind] = useState<string | null>(startKind);
  const [selected, setSelected] = useState<Place | null>(null);
  const [recenter, setRecenter] = useState(0);
  const shown = useMemo(() => (kind ? places.filter((p) => p.kind === kind) : places), [places, kind]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[var(--bg)]" role="dialog" aria-modal="true">
      <div className="space-y-2 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-sm">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="flex h-10 items-center gap-1 rounded-full bg-[var(--bg2)] pl-2 pr-3 text-sm font-semibold text-[var(--accent)] active:scale-95">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            {t.back}
          </button>
          <span className="min-w-0 flex-1 truncate text-sm font-bold">{t.nearbyTitle}</span>
        </div>
        {kinds.length ? (
          <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[null, ...kinds].map((k) => (
              <button
                key={k ?? "all"}
                type="button"
                onClick={() => { haptic("select"); setKind(k); setSelected(null); }}
                className={`min-h-9 shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold ${kind === k ? "bg-[var(--accent)] text-white" : "bg-[var(--bg2)] text-[var(--text)]"}`}
              >
                {k ? `${PLACE_EMOJI[k]} ${t.places[k]}` : `${t.all} · ${places.length}`}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="relative min-h-0 flex-1">
        <PlacesMap lang={lang} center={center} exact={exact} places={shown} selected={selected} interactive onSelect={setSelected} recenter={recenter} />
        <button
          type="button"
          onClick={() => { haptic("tap"); setSelected(null); setRecenter((n) => n + 1); }}
          aria-label={t.thisFlat}
          className="absolute left-3 top-3 z-[500] flex items-center gap-1.5 rounded-full bg-[var(--bg)] px-3 py-2 text-xs font-semibold shadow-md active:scale-95"
        >
          🏠 {t.thisFlat}
        </button>
        {selected ? (
          <div className="absolute inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[500] flex items-center gap-3 rounded-2xl bg-[var(--bg)] p-3 pr-14 shadow-lg">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl" style={{ background: `${PLACE_COLOR[selected.kind]}22` }}>{PLACE_EMOJI[selected.kind]}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{placeLabel(selected, lang) || t.places[selected.kind]}</span>
              <span className="block text-xs text-[var(--hint)]">{t.places[selected.kind]} · {t.walkMin(selected.minutes)}</span>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** "What's nearby": tiles per kind (sent with the listing, so they show at once) and a preview map that opens full screen. */
export function NearbySection({ item, lang, t }: { item: CatalogItem; lang: Lang; t: Dict }) {
  const [data, setData] = useState<Nearby | "loading" | "error">("loading");
  const [full, setFull] = useState<string | null | false>(false);

  useEffect(() => {
    if (!item.point) return;
    let alive = true;
    setData("loading");
    // Saved lookups come back in a moment; a flat never looked up takes ~12 s, so give up after 30 s.
    fetchNearby(item.ref).then((value) => alive && setData(value ?? "error"));
    return () => {
      alive = false;
    };
  }, [item.ref, item.point]);

  // Shown inside the app root (it carries the colour variables), above the listing page.
  // Back (ours, Telegram's or the phone's) closes the full-screen map first.
  const openFull = (k: string | null) => {
    haptic("tap");
    history.pushState({ ...(history.state ?? {}), nearbyMap: 1 }, "");
    setFull(k);
  };
  useEffect(() => {
    if (full === false) return;
    const onPop = (event: PopStateEvent) => {
      if (!(event.state as { nearbyMap?: number } | null)?.nearbyMap) setFull(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [full]);

  if (!item.point) return null;
  const places = typeof data === "object" ? data.places : NO_PLACES;
  const center = typeof data === "object" ? data.center : item.point;
  // Tiles: from the lookup once it is here, before that from the summary sent with the listing.
  const tiles = places.length
    ? KIND_ORDER.filter((k) => places.some((p) => p.kind === k)).map((k) => {
        const list = places.filter((p) => p.kind === k);
        return { kind: k, count: list.length, minutes: Math.min(...list.map((p) => p.minutes)) };
      })
    : [...(item.nearby ?? [])].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const waiting = data === "loading" && !item.nearby;

  return (
    <section className="overflow-hidden rounded-2xl bg-[var(--bg)]">
      <div className="px-4 pt-3">
        <h2 className="text-sm font-semibold">📍 {t.location} · {t.nearbyTitle}</h2>
        {waiting ? <p className="mt-1 text-xs text-[var(--hint)]">{t.nearbyLoading}</p> : null}
        {typeof data === "object" && !places.length ? <p className="mt-1 text-xs text-[var(--hint)]">{t.nearbyNone}</p> : null}
      </div>
      {tiles.length ? (
        <div className="mt-2 grid grid-cols-2 gap-1.5 px-3">
          {tiles.map((tile) => (
            <button key={tile.kind} type="button" onClick={() => openFull(tile.kind)} className="flex items-center gap-2 rounded-xl bg-[var(--bg2)] px-2.5 py-2 text-left active:scale-[0.98]">
              <span className="text-lg">{PLACE_EMOJI[tile.kind]}</span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold">{t.places[tile.kind]}{tile.count > 1 ? ` · ${tile.count}` : ""}</span>
                <span className="block truncate text-[11px] text-[var(--hint)]">{t.walkMin(tile.minutes)}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <button type="button" onClick={() => openFull(null)} className="relative isolate mt-3 block h-52 w-full" aria-label={t.openMap}>
        <PlacesMap lang={lang} center={center} exact={Boolean(item.point.exact)} places={places} interactive={false} />
        <span className="pointer-events-none absolute bottom-3 right-3 z-[500] flex items-center gap-1.5 rounded-full bg-[var(--bg)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)] shadow-md">⤢ {t.openMap}</span>
      </button>
      <p className="px-4 py-2 text-[11px] text-[var(--hint)]">{[item.point.exact ? "" : t.approxNote, tiles.length ? t.nearbyNote : ""].filter(Boolean).join(" · ")}</p>
      {full !== false ? (
        createPortal(<MapScreen center={center} exact={Boolean(item.point.exact)} places={places} kinds={tiles.map((x) => x.kind)} startKind={full} lang={lang} t={t} onClose={() => history.back()} />, (document.querySelector("[data-catalog-root]") as HTMLElement | null) ?? document.body)
      ) : null}
    </section>
  );
}
