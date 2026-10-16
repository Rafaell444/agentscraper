import type { Listing } from "@prisma/client";
import { fmtMoney, fmtNum } from "./format";

/** Default post text for our channels: facts from the listing, our contact. */
export function buildPublicationText(listing: Listing, contactPhone: string, agencyName: string): string {
  const lines: string[] = [];
  const headline = [listing.dealType, listing.rooms ? `${listing.rooms} ოთახიანი` : "", listing.propertyType, listing.neighbourhood ? `${listing.neighbourhood}ში` : ""].filter(Boolean).join(" ");
  lines.push(`🏠 ${headline || listing.title || ""}`.trim());
  const facts: string[] = [];
  if (listing.areaM2) facts.push(`${fmtNum(listing.areaM2)} მ²`);
  if (listing.floor != null) facts.push(`${listing.floor}${listing.totalFloors ? `/${listing.totalFloors}` : ""} სართული`);
  if (listing.bedrooms) facts.push(`${listing.bedrooms} საძინებელი`);
  if (listing.condition) facts.push(listing.condition);
  if (listing.status) facts.push(listing.status);
  if (facts.length) lines.push(`📐 ${facts.join(" · ")}`);
  if (listing.priceUsd) lines.push(`💵 ${fmtMoney(listing.priceUsd)}${listing.priceGel ? ` (${fmtMoney(listing.priceGel, "₾")})` : ""}`);
  if (listing.district || listing.neighbourhood) lines.push(`📍 ${[listing.district, listing.neighbourhood, listing.address].filter(Boolean).join(", ")}`);
  if (listing.description) {
    const text = listing.description.replace(/\s+/g, " ").trim();
    lines.push("", text.length > 400 ? `${text.slice(0, 399)}…` : text);
  }
  lines.push("", `📞 ${contactPhone || "—"}${agencyName ? ` · ${agencyName}` : ""}`);
  return lines.join("\n");
}
