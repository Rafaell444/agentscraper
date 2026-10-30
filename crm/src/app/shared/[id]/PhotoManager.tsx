"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resizeImage } from "@/lib/resizeImage";
import { deletePhoto, movePhoto, setPhotoKind } from "../actions";

export function PhotoManager({ postId, token, photoIds, planIds = [] }: { postId: string; token: string; photoIds: string[]; planIds?: string[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState("");
  const [busy, startTransition] = useTransition();

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    let done = 0;
    for (const file of list) {
      setProgress(`იტვირთება ${done + 1} / ${list.length}…`);
      const form = new FormData();
      form.append("file", new File([await resizeImage(file)], "photo.jpg", { type: "image/jpeg" }));
      const response = await fetch(`/api/shared-posts/${postId}/photos`, { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      done += 1;
      if (result.full) {
        setProgress("მაქსიმუმ 20 ფოტო.");
        break;
      }
    }
    if (input.current) input.current.value = "";
    setProgress("");
    router.refresh();
  }

  const act = (fn: () => Promise<void>) => startTransition(async () => {
    await fn();
    router.refresh();
  });

  return (
    <div className="space-y-3">
      {photoIds.length === 0 ? <p className="text-sm text-gray-500">ფოტოები არ არის. ატვირთე ტელეფონიდან ან კომპიუტერიდან.</p> : null}
      <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 ${busy ? "opacity-60" : ""}`}>
        {photoIds.map((id, index) => (
          <div key={id} className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/s/${token}/photo/${id}`} alt="" className="h-32 w-full object-cover" loading="lazy" />
            {planIds.includes(id) ? <span className="absolute left-1 top-1 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">📐 გეგმა</span> : index === 0 ? <span className="absolute left-1 top-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">მთავარი</span> : null}
            <div className="flex items-center justify-between gap-1 p-1">
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm px-2" disabled={index === 0 || busy} onClick={() => act(() => movePhoto(id, -1))} aria-label="მარცხნივ">◀</button>
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm px-2" disabled={index === photoIds.length - 1 || busy} onClick={() => act(() => movePhoto(id, 1))} aria-label="მარჯვნივ">▶</button>
              <button type="button" className={`ui-btn ui-btn-sm px-2 ${planIds.includes(id) ? "ui-btn-primary" : "ui-btn-ghost"}`} disabled={busy} onClick={() => act(() => setPhotoKind(id, planIds.includes(id) ? "photo" : "plan"))} title="სართულის გეგმა (აპში ცალკე ჩანართში ჩანს)" aria-label="გეგმა">📐</button>
              <button
                type="button"
                className="ui-btn ui-btn-danger ui-btn-sm px-2"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("წავშალო ეს ფოტო?")) act(() => deletePhoto(id));
                }}
                aria-label="წაშლა"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
        <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={Boolean(progress)} onClick={() => input.current?.click()}>
          + ფოტოების ატვირთვა
        </button>
        {progress ? <span className="text-xs text-gray-600">{progress}</span> : <span className="text-[11px] text-gray-500">პირველი ფოტო მთავარია. ◀ ▶ — რიგის შეცვლა, 📐 — სართულის გეგმა (აპში ცალკე ჩანართი „გეგმა“), ✕ — წაშლა.</span>}
      </div>
    </div>
  );
}
