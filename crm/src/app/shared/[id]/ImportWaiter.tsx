"use client";

import { useEffect, useState } from "react";

/** Polls while the collector fetches the MyHome listing, then reloads the editor. */
export function ImportWaiter({ postId }: { postId: string }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    let stopped = false;
    const started = Date.now();
    const tick = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1000);
    async function poll() {
      while (!stopped) {
        await new Promise((resolve) => setTimeout(resolve, 8000));
        if (stopped) return;
        const response = await fetch(`/api/shared-posts/${postId}/fill`, { method: "POST" }).catch(() => null);
        const result = await response?.json().catch(() => null);
        if (result && result.state !== "waiting") {
          window.location.reload();
          return;
        }
      }
    }
    poll();
    return () => {
      stopped = true;
      clearInterval(tick);
    };
  }, [postId]);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
      <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-sky-300 border-t-sky-700" aria-hidden />
      <span>
        MyHome-დან ფოტოები, რუკა და დეტალები იტვირთება (ჩვეულებრივ 1–2 წუთი, {seconds} წმ). დაელოდე — გვერდი თავად განახლდება, მერე შეცვალე ტექსტი და ნომერი.
      </span>
    </div>
  );
}
