"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resizeImage } from "@/lib/resizeImage";
import { deleteMyPhoto } from "../../actions";

/** Photos of the partner's own post: add (resized in the browser) and remove. */
export function MyPhotos({ postId, photos }: { postId: string; photos: { id: string; url: string }[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState("");
  const [busy, startTransition] = useTransition();

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    for (let i = 0; i < list.length; i++) {
      setProgress(`Uploading ${i + 1} / ${list.length}…`);
      const form = new FormData();
      form.append("file", new File([await resizeImage(list[i])], "photo.jpg", { type: "image/jpeg" }));
      const response = await fetch(`/api/shared-posts/${postId}/photos`, { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (result.full) {
        setProgress("Maximum 20 photos.");
        break;
      }
    }
    if (input.current) input.current.value = "";
    setProgress("");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {photos.map((photo) => (
          <div key={photo.id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="" className="h-24 w-24 rounded-lg object-cover" />
            <button
              type="button"
              disabled={busy}
              onClick={() => startTransition(async () => { await deleteMyPhoto(photo.id); router.refresh(); })}
              className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs text-white"
              aria-label="Remove photo"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <input ref={input} type="file" accept="image/*" multiple onChange={(e) => upload(e.target.files)} className="block text-sm" />
      {progress ? <p className="text-xs text-gray-500">{progress}</p> : null}
    </div>
  );
}
