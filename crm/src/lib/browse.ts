import { placeName } from "./catalog";
import { EN_TYPE, en } from "./segments";

/** "2-room apartment for rent in Saburtalo" from a scraped listing's facts (the partner's English listings). */
export function englishTitle(l: { rooms: number | null; propertyType: string | null; dealType: string | null; neighbourhood: string | null; district: string | null }): string {
  const type = en(EN_TYPE, l.propertyType) || "Flat";
  const deal = l.dealType === "იყიდება" ? "for sale" : l.dealType === "ქირავდება დღიურად" ? "for daily rent" : "for rent";
  const place = placeName(l.neighbourhood || l.district, "en");
  return `${l.rooms ? `${l.rooms}-room ` : ""}${type.toLowerCase()} ${deal}${place ? ` in ${place}` : ""}`.replace(/^./, (c) => c.toUpperCase());
}
