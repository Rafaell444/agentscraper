// OpenStreetMap embed for shared posts.  "approx" snaps the point to a ~500 m
// grid and drops the marker, so a client sees the area, not the building.

export type MapMode = "exact" | "approx" | "off";

export function mapView(lat: number | null | undefined, lng: number | null | undefined, mode: string) {
  if (lat == null || lng == null || mode === "off") return null;
  const exact = mode === "exact";
  const step = 0.005;
  const cLat = exact ? lat : Math.round(lat / step) * step;
  const cLng = exact ? lng : Math.round(lng / step) * step;
  const half = exact ? 0.004 : 0.012;
  const bbox = [cLng - half * 1.4, cLat - half, cLng + half * 1.4, cLat + half].map((n) => n.toFixed(6)).join(",");
  const marker = exact ? `&marker=${lat.toFixed(6)},${lng.toFixed(6)}` : "";
  return {
    exact,
    embedUrl: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik${marker}`,
    openUrl: exact
      ? `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`
      : `https://www.google.com/maps/@${cLat.toFixed(4)},${cLng.toFixed(4)},15z`,
  };
}
