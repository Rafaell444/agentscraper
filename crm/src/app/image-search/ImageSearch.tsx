"use client";

import { useState } from "react";
import Link from "next/link";
import { dhashFile } from "@/lib/imageHash";

type Item = {
  id: string; title: string | null; siteName: string; link: string | null; owner: boolean; ownerName: string | null;
  phone: string | null; phoneFrom: string | null; priceUsd: number | null; areaM2: number | null; rooms: number | null;
  floor: number | null; totalFloors: number | null; place: string | null; image: string | null; archived: boolean; collectedAt: string | null;
};
type Result = Item & { distance: number; exact: boolean; photo: number; matchedUrl: string; copies: Item[] };

const money = (v: number | null) => (v ? `$${Math.round(v).toLocaleString("en-US")}` : "");

function Posting({ item, highlight }: { item: Item; highlight?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 text-sm ${highlight ? "bg-emerald-50" : ""}`}>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.owner ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-700"}`}>{item.owner ? "მესაკუთრე" : "აგენტი"}</span>
      <Link href={`/listings/${encodeURIComponent(item.id)}`} className="min-w-0 max-w-full truncate font-medium text-gray-900 hover:text-emerald-700">{item.title ?? item.id}</Link>
      <span className="text-xs text-gray-500">
        {item.siteName}
        {item.ownerName ? ` · ${item.ownerName}` : ""}
        {item.priceUsd ? ` · ${money(item.priceUsd)}` : ""}
        {item.archived ? " · საიტიდან წაშლილია" : ""}
      </span>
      {item.phone ? (
        <a href={`tel:${item.phone.split(";")[0].trim()}`} className="rounded-md bg-emerald-600 px-2 py-0.5 font-mono text-sm font-semibold text-white">📞 {item.phone.split(";")[0].trim()}</a>
      ) : (
        <span className="text-xs text-gray-400">ნომერი ჯერ არ გვაქვს</span>
      )}
      {item.phoneFrom ? <span className="text-[11px] text-gray-400">({item.phoneFrom}-ის ასლიდან)</span> : null}
      {item.link ? <a href={item.link} target="_blank" rel="noreferrer" className="text-xs text-emerald-700 underline">საიტზე ↗</a> : null}
    </div>
  );
}

export function ImageSearch() {
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [indexed, setIndexed] = useState(0);

  async function search(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, 30);
    previews.forEach((url) => URL.revokeObjectURL(url));
    setPreviews(list.map((f) => URL.createObjectURL(f)));
    setBusy(true);
    setError("");
    setResults(null);
    try {
      const hashes = await Promise.all(list.map((f) => dhashFile(f).catch(() => "")));
      const good = hashes.filter(Boolean);
      if (!good.length) throw new Error("ფოტოები ვერ წავიკითხე");
      const response = await fetch("/api/image-search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hashes }) });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error || "ძებნა ვერ მოხერხდა");
      setResults(json.results);
      setIndexed(json.indexed);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 p-8 text-center hover:bg-emerald-50">
        <span className="text-3xl">🖼️</span>
        <span className="font-semibold text-gray-900">აირჩიე ერთი ან რამდენიმე ფოტო ერთად</span>
        <span className="text-xs text-gray-500">ფოტოები სერვერზე არ იტვირთება — ბრაუზერი მხოლოდ მათ „ანაბეჭდს“ აგზავნის</span>
        <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => search(e.target.files)} />
      </label>

      {previews.length ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {previews.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" title={`ფოტო ${i + 1}`} className="h-20 w-20 shrink-0 rounded-lg object-cover" />
          ))}
        </div>
      ) : null}

      {busy ? <p className="text-sm text-gray-500">ვეძებ…</p> : null}
      {error ? <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900">{error}</p> : null}

      {results ? (
        results.length === 0 ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">ასეთი ფოტო ჩვენს განცხადებებში ვერ მოიძებნა (შემოწმდა {indexed.toLocaleString("en-US")} ფოტო).</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">ნაპოვნია {results.length} განცხადება (შემოწმდა {indexed.toLocaleString("en-US")} ფოტო).</p>
            {results.map((r) => (
              <div key={r.id} className="ui-card space-y-2 p-3">
                <div className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previews[r.photo]} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" title="შენი ფოტო" />
                  <span className="self-center text-gray-400">=</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.matchedUrl} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" referrerPolicy="no-referrer" title="ფოტო განცხადებიდან" />
                  <div className="min-w-0 flex-1">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.exact ? "bg-emerald-600 text-white" : "bg-amber-100 text-amber-900"}`}>{r.exact ? "იგივე ფოტო" : "ძალიან ჰგავს"}</span>
                    <div className="mt-1 text-xs text-gray-500">
                      {[r.place, r.rooms ? `${r.rooms} ოთ.` : "", r.areaM2 ? `${Math.round(r.areaM2)} მ²` : "", r.floor ? `${r.floor}${r.totalFloors ? `/${r.totalFloors}` : ""} სართ.` : ""].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </div>
                <Posting item={r} highlight />
                {r.copies.length ? (
                  <div className="space-y-1 border-t border-gray-100 pt-2">
                    <div className="text-xs font-semibold text-gray-600">იგივე ბინა სხვა განცხადებებში ({r.copies.length}){r.copies.some((c) => c.owner) ? " — მესაკუთრის პოსტი ჩათვლით" : ""}</div>
                    {[...r.copies].sort((a, b) => Number(b.owner) - Number(a.owner)).map((c) => <Posting key={c.id} item={c} highlight={c.owner} />)}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
