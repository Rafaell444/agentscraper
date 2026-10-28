"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadPhotos } from "@/lib/resizeImage";

export function BannerPhotoUpload({ bannerId }: { bannerId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState("");
  return (
    <div className="flex items-center gap-2">
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          if (!files.length) return;
          await uploadPhotos(`/api/banners/${bannerId}/photos`, files, (done, total) => setProgress(`${Math.min(done + 1, total)} / ${total}…`));
          setProgress("");
          if (input.current) input.current.value = "";
          router.refresh();
        }}
      />
      <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={Boolean(progress)} onClick={() => input.current?.click()}>
        📷 {progress ? `იტვირთება ${progress}` : "ფოტოს დამატება"}
      </button>
    </div>
  );
}
