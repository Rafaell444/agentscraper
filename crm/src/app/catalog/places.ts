// Nearby place kinds (lib/nearby) as the mini app draws them: on the listing
// page, around the selected pin on the main map, and in the "near" filter.

export const PLACE_EMOJI: Record<string, string> = { supermarket: "🛒", school: "🏫", kindergarten: "🧸", park: "🌳", cafe: "☕", pharmacy: "💊", gym: "🏋️" };
export const PLACE_COLOR: Record<string, string> = { supermarket: "#16a34a", school: "#2563eb", kindergarten: "#db2777", park: "#15803d", cafe: "#b45309", pharmacy: "#dc2626", gym: "#7c3aed" };
export const KIND_ORDER = ["supermarket", "school", "kindergarten", "park", "cafe", "pharmacy", "gym"];

/** "Near a school" in the filters means at most this many minutes on foot. */
export const NEAR_MINUTES = 7;

export type MapPlace = { kind: string; lat: number; lng: number; minutes: number; name: Record<"ka" | "en" | "ru", string> };

/** Round icon for a place; on=true is the highlighted one. */
export function placeHtml(kind: string, on = false, size = 28): string {
  const s = on ? size + 6 : size;
  return `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${on ? PLACE_COLOR[kind] : "#fff"};border:2px solid ${PLACE_COLOR[kind] ?? "#555"};box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:${Math.round(s / 2)}px;transform:translate(-50%,-50%);transition:all .15s">${PLACE_EMOJI[kind] ?? "•"}</div>`;
}

/** Saved lookups per flat, shared by the listing page and the main map. */
const cache = new Map<number, Promise<{ center: { lat: number; lng: number }; places: MapPlace[] } | null>>();
export function fetchNearby(ref: number) {
  let hit = cache.get(ref);
  if (!hit) {
    hit = fetch(`/api/catalog/nearby?ref=${ref}`, { signal: AbortSignal.timeout(30000) })
      .then((r) => r.json())
      .then((json) => (json.ok ? { center: json.center, places: json.places as MapPlace[] } : null))
      .catch(() => null);
    cache.set(ref, hit);
    // A failed lookup may work next time.
    hit.then((value) => {
      if (!value) cache.delete(ref);
    });
  }
  return hit;
}
