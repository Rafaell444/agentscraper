import type { AlertRule, Prisma } from "@prisma/client";

// Saved searches for Telegram alerts.  notify.py applies the same rules in
// Python when it sends; keep the two in step.

export const csv = (value: string | null | undefined): string[] =>
  String(value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

/** Prisma filter for the listings a rule would send (used for the preview count). */
export function ruleWhere(rule: Pick<AlertRule, "dealTypes" | "propertyTypes" | "areas" | "sites" | "posterKind" | "priceMin" | "priceMax" | "areaMin" | "areaMax" | "roomsMin" | "roomsMax" | "keywords">): Prisma.ListingWhereInput {
  const and: Prisma.ListingWhereInput[] = [{ archived: false }];
  if (csv(rule.dealTypes).length) and.push({ dealType: { in: csv(rule.dealTypes) } });
  if (csv(rule.propertyTypes).length) and.push({ propertyType: { in: csv(rule.propertyTypes) } });
  if (csv(rule.sites).length) and.push({ site: { in: csv(rule.sites) } });
  if (csv(rule.areas).length) and.push({ OR: [{ district: { in: csv(rule.areas) } }, { neighbourhood: { in: csv(rule.areas) } }] });
  if (rule.posterKind) and.push({ posterKind: rule.posterKind });
  if (rule.priceMin != null || rule.priceMax != null) and.push({ priceUsd: { gte: rule.priceMin ?? undefined, lte: rule.priceMax ?? undefined } });
  if (rule.areaMin != null || rule.areaMax != null) and.push({ areaM2: { gte: rule.areaMin ?? undefined, lte: rule.areaMax ?? undefined } });
  if (rule.roomsMin != null || rule.roomsMax != null) and.push({ rooms: { gte: rule.roomsMin ?? undefined, lte: rule.roomsMax ?? undefined } });
  const words = csv(rule.keywords);
  if (words.length) and.push({ OR: words.flatMap((word) => [{ title: { contains: word } }, { description: { contains: word } }]) });
  return { AND: and };
}

/** One line describing a rule, e.g. "ქირავდება · ბინა · ვაკე, საბურთალო · $500–900 · 2+ ოთ." */
export function ruleSummary(rule: AlertRule): string {
  const range = (min: number | null, max: number | null, unit: string, prefix = "") =>
    min != null && max != null ? `${prefix}${min}–${max}${unit}` : min != null ? `${prefix}${min}+${unit}` : max != null ? `≤ ${prefix}${max}${unit}` : "";
  return [
    csv(rule.dealTypes).join("/"),
    csv(rule.propertyTypes).join("/"),
    csv(rule.areas).join(", "),
    range(rule.priceMin, rule.priceMax, "", "$"),
    range(rule.areaMin, rule.areaMax, " მ²"),
    range(rule.roomsMin, rule.roomsMax, " ოთ."),
    rule.posterKind === "owner" ? "მხოლოდ მესაკუთრე" : rule.posterKind === "agent" ? "მხოლოდ აგენტი" : "",
    csv(rule.sites).join(", "),
    csv(rule.keywords).length ? `სიტყვები: ${csv(rule.keywords).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" · ") || "ყველა ახალი განცხადება";
}
