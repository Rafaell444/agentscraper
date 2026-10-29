import type { Lang } from "./catalog";

// Tbilisi metro stations (coordinates from OpenStreetMap), in line order.
// Station Square is the interchange of both lines.

export type MetroStation = { id: string; lines: number[]; lat: number; lng: number; name: Record<Lang, string> };

export const METRO_LINE_COLOR: Record<number, string> = { 1: "#dc2626", 2: "#16a34a" };

export const METRO: MetroStation[] = [
  { id: "akhmeteli", lines: [1], lat: 41.79106, lng: 44.815, name: { ka: "ახმეტელის თეატრი", en: "Akhmeteli Theatre", ru: "Театр Ахметели" } },
  { id: "sarajishvili", lines: [1], lat: 41.78406, lng: 44.79992, name: { ka: "სარაჯიშვილი", en: "Sarajishvili", ru: "Сараджишвили" } },
  { id: "guramishvili", lines: [1], lat: 41.77576, lng: 44.79558, name: { ka: "გურამიშვილი", en: "Guramishvili", ru: "Гурамишвили" } },
  { id: "ghrmaghele", lines: [1], lat: 41.76497, lng: 44.78996, name: { ka: "ღრმაღელე", en: "Ghrmaghele", ru: "Грмагеле" } },
  { id: "didube", lines: [1], lat: 41.74945, lng: 44.77999, name: { ka: "დიდუბე", en: "Didube", ru: "Дидубе" } },
  { id: "gotsiridze", lines: [1], lat: 41.74294, lng: 44.78405, name: { ka: "გოცირიძე", en: "Gotsiridze", ru: "Гоциридзе" } },
  { id: "nadzaladevi", lines: [1], lat: 41.7334, lng: 44.79643, name: { ka: "ნაძალადევი", en: "Nadzaladevi", ru: "Надзаладеви" } },
  { id: "station_square", lines: [1, 2], lat: 41.72256, lng: 44.7971, name: { ka: "სადგურის მოედანი", en: "Station Square", ru: "Вокзальная площадь" } },
  { id: "marjanishvili", lines: [1], lat: 41.70959, lng: 44.79687, name: { ka: "მარჯანიშვილი", en: "Marjanishvili", ru: "Марджанишвили" } },
  { id: "rustaveli", lines: [1], lat: 41.7035, lng: 44.78965, name: { ka: "რუსთაველი", en: "Rustaveli", ru: "Руставели" } },
  { id: "liberty_square", lines: [1], lat: 41.69452, lng: 44.80056, name: { ka: "თავისუფლების მოედანი", en: "Liberty Square", ru: "Площадь Свободы" } },
  { id: "avlabari", lines: [1], lat: 41.69226, lng: 44.81584, name: { ka: "ავლაბარი", en: "Avlabari", ru: "Авлабари" } },
  { id: "aragveli", lines: [1], lat: 41.68799, lng: 44.82623, name: { ka: "300 არაგველი", en: "300 Aragveli", ru: "300 Арагвели" } },
  { id: "isani", lines: [1], lat: 41.68663, lng: 44.83996, name: { ka: "ისანი", en: "Isani", ru: "Исани" } },
  { id: "samgori", lines: [1], lat: 41.68552, lng: 44.85448, name: { ka: "სამგორი", en: "Samgori", ru: "Самгори" } },
  { id: "varketili", lines: [1], lat: 41.6919, lng: 44.87088, name: { ka: "ვარკეთილი", en: "Varketili", ru: "Варкетили" } },
  { id: "tsereteli", lines: [2], lat: 41.72641, lng: 44.78766, name: { ka: "წერეთელი", en: "Tsereteli", ru: "Церетели" } },
  { id: "technical_university", lines: [2], lat: 41.72035, lng: 44.77664, name: { ka: "ტექნიკური უნივერსიტეტი", en: "Technical University", ru: "Технический университет" } },
  { id: "medical_university", lines: [2], lat: 41.72728, lng: 44.76384, name: { ka: "სამედიცინო უნივერსიტეტი", en: "Medical University", ru: "Медицинский университет" } },
  { id: "delisi", lines: [2], lat: 41.72549, lng: 44.74534, name: { ka: "დელისი", en: "Delisi", ru: "Делиси" } },
  { id: "vazha_pshavela", lines: [2], lat: 41.72403, lng: 44.73085, name: { ka: "ვაჟა-ფშაველა", en: "Vazha-Pshavela", ru: "Важа-Пшавела" } },
  { id: "state_university", lines: [2], lat: 41.72283, lng: 44.71851, name: { ka: "სახელმწიფო უნივერსიტეტი", en: "State University", ru: "Государственный университет" } },
];

/** Stations of a line in travel order (for drawing it). */
export function metroLine(line: number): MetroStation[] {
  return METRO.filter((s) => s.lines.includes(line));
}

function meters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
}

export type MetroNear = { id: string; minutes: number };

/** Stations within walking reach, nearest first; minutes on foot (streets are ~30% longer than a straight line). */
export function metroNearby(lat: number | null, lng: number | null, maxMinutes = 20): MetroNear[] {
  if (lat == null || lng == null) return [];
  return METRO.map((station) => ({ id: station.id, minutes: Math.max(1, Math.round((meters(lat, lng, station.lat, station.lng) * 1.3) / 80)) }))
    .filter((near) => near.minutes <= maxMinutes)
    .sort((a, b) => a.minutes - b.minutes);
}

export function metroName(id: string, lang: Lang): string {
  return METRO.find((s) => s.id === id)?.name[lang] ?? id;
}
