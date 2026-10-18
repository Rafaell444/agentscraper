"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Photo slider with arrows; tap a photo for a full-screen viewer (arrows,
 * swipe, keyboard ← → Esc, pinch-zoom on phones). */
export function Gallery({ urls }: { urls: string[] }) {
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const count = urls.length;

  const goTo = useCallback((next: number) => {
    const el = strip.current;
    if (!el) return;
    const target = (next + count) % count;
    el.scrollTo({ left: target * el.clientWidth, behavior: "smooth" });
  }, [count]);

  // Track the visible slide while the user swipes.
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  if (!count) return null;

  return (
    <>
      <div className="relative bg-gray-900">
        <div ref={strip} className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {urls.map((url, i) => (
            <button key={url} type="button" className="relative w-full shrink-0 snap-center cursor-zoom-in" onClick={() => setOpen(i)} aria-label={`ფოტო ${i + 1} — გადიდება`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-[300px] w-full object-contain sm:h-[460px]" loading={i < 2 ? "eager" : "lazy"} draggable={false} />
            </button>
          ))}
        </div>
        {count > 1 ? (
          <>
            <Arrow side="left" onClick={() => goTo(index - 1)} />
            <Arrow side="right" onClick={() => goTo(index + 1)} />
          </>
        ) : null}
        <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">
          {count > 1 ? `${index + 1} / ${count} · ` : ""}🔍
        </span>
      </div>
      {open !== null ? <Lightbox urls={urls} start={open} onClose={(last) => { setOpen(null); goTo(last); }} /> : null}
    </>
  );
}

function Arrow({ side, onClick, big = false }: { side: "left" | "right"; onClick: () => void; big?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={side === "left" ? "წინა ფოტო" : "შემდეგი ფოტო"}
      className={`absolute top-1/2 -translate-y-1/2 ${side === "left" ? "left-2" : "right-2"} flex items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${big ? "h-12 w-12" : "h-10 w-10"}`}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={side === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
      </svg>
    </button>
  );
}

function Lightbox({ urls, start, onClose }: { urls: string[]; start: number; onClose: (last: number) => void }) {
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(start);
  const count = urls.length;

  const goTo = useCallback((next: number, smooth = true) => {
    const el = strip.current;
    if (!el) return;
    el.scrollTo({ left: ((next + count) % count) * el.clientWidth, behavior: smooth ? "smooth" : "auto" });
  }, [count]);

  useEffect(() => {
    goTo(start, false);
    const el = strip.current;
    const onScroll = () => el && setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el?.addEventListener("scroll", onScroll, { passive: true });
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      el?.removeEventListener("scroll", onScroll);
      document.body.style.overflow = previous;
    };
  }, [goTo, start]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(index);
      if (e.key === "ArrowLeft") goTo(index - 1);
      if (e.key === "ArrowRight") goTo(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, index, onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black" role="dialog" aria-modal="true" aria-label="ფოტოები">
      <div ref={strip} className="flex h-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {urls.map((url) => (
          <div key={url} className="flex h-full w-full shrink-0 snap-center items-center justify-center pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="max-h-full max-w-full object-contain" />
          </div>
        ))}
      </div>
      {count > 1 ? (
        <>
          <Arrow side="left" big onClick={() => goTo(index - 1)} />
          <Arrow side="right" big onClick={() => goTo(index + 1)} />
        </>
      ) : null}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <span className="rounded-full bg-black/50 px-2.5 py-1 text-xs">{index + 1} / {count}</span>
        <button type="button" onClick={() => onClose(index)} aria-label="დახურვა" className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-2xl leading-none hover:bg-black/70">
          ×
        </button>
      </div>
    </div>
  );
}
