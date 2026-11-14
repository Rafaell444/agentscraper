"use client";

import { useState } from "react";
import { logShare } from "./actions";

// One flat's share buttons.  On a phone, "Share photos + text" opens the
// system share sheet with the photos and the English text: pick WhatsApp,
// then the group.  The text is also copied, in case WhatsApp drops it next
// to several photos (then long-press the caption field and paste).

export function ShareFlat({ refNo, text, photos, label }: { refNo: number; text: string; photos: string[]; label?: string }) {
  const what = label ?? (refNo ? `ID ${refNo}` : text.split("\n")[0].replace(/\*/g, "").slice(0, 80));
  const log = (how: "photos" | "text" | "copy") => void logShare(what, how).catch(() => undefined);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function copy(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function shareAll() {
    setBusy(true);
    setNote("");
    try {
      const copied = await copy();
      const files = (
        await Promise.all(
          photos.map(async (url, index) => {
            const response = await fetch(url);
            if (!response.ok) return null;
            const blob = await response.blob();
            const type = blob.type || "image/jpeg";
            return new File([blob], `flat-${refNo}-${index + 1}.${type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg"}`, { type });
          }),
        )
      ).filter((file): file is File => Boolean(file));
      if (files.length && navigator.canShare?.({ files })) {
        await navigator.share({ files, text });
        log("photos");
        setNote(copied ? "Text is copied too: paste it if WhatsApp did not add it." : "");
      } else {
        // A computer without a share sheet: open WhatsApp with the text.
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
        log("text");
        setNote("This device cannot share photos: only the text was sent. Use your phone for photos.");
      }
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") setNote("Could not share. Try “Text only”.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={shareAll} disabled={busy} className="ui-btn ui-btn-primary ui-btn-sm">
          {busy ? "Preparing…" : `📤 Share photos + text`}
        </button>
        <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" onClick={() => log("text")} className="ui-btn ui-btn-secondary ui-btn-sm">
          💬 Text only
        </a>
        <button type="button" onClick={async () => { const ok = await copy(); if (ok) log("copy"); setNote(ok ? "Text copied." : "Could not copy."); }} className="ui-btn ui-btn-ghost ui-btn-sm">
          📋 Copy
        </button>
      </div>
      {note ? <p className="text-xs text-gray-500">{note}</p> : null}
      <details className="text-xs text-gray-500">
        <summary className="cursor-pointer">Preview text</summary>
        <pre className="mt-1 whitespace-pre-wrap font-sans">{text}</pre>
      </details>
    </div>
  );
}
