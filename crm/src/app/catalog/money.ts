// The price as the viewer wants to see it: as listed, or converted to $, ₾, €
// or ₽ at today's rate.  CatalogApp sets the choice while rendering, so every
// card, pin and page below it uses the same currency.

import { CURRENCY_SIGN, FALLBACK_RATES, convert, priceText, type CatalogItem, type Currency, type Lang, type Rates } from "@/lib/catalog";

let shown: { currency: Currency | ""; rates: Rates; lang: Lang } = { currency: "", rates: FALLBACK_RATES, lang: "en" };

export function setShownCurrency(currency: Currency | "", rates: Rates, lang: Lang = shown.lang) {
  shown = { currency, rates, lang };
}

/** 1 200 → "1.2k" / Russian "1,2К"; 1 500 000 → "1.5M" / "1,5 Млн". */
export function shortNumber(v: number, lang: Lang = shown.lang): string {
  const ru = lang === "ru";
  const one = (x: number) => (ru ? x.toFixed(1).replace(/\.0$/, "").replace(".", ",") : x.toFixed(1).replace(/\.0$/, ""));
  if (v >= 1_000_000) return ru ? `${one(v / 1_000_000)} Млн` : `${one(v / 1_000_000)}M`;
  if (v >= 10_000) return `${Math.round(v / 1000)}${ru ? "К" : "k"}`;
  if (v >= 1000) return `${one(v / 1000)}${ru ? "К" : "k"}`;
  return String(Math.round(v));
}

type Priced = Pick<CatalogItem, "price" | "currency" | "kind">;

/** True when the price is shown converted from another currency. */
export function converted(item: Pick<CatalogItem, "price" | "currency">): boolean {
  return Boolean(shown.currency && item.price != null && shown.currency !== item.currency);
}

/** "≈ 2 340 ₾/mo" (converted) or "$900/mo" (as listed). */
export function money(item: Priced, lang: Lang): string {
  if (!converted(item)) return priceText(item.price, item.currency, item.kind, lang);
  const value = convert(item.price!, item.currency, shown.currency as Currency, shown.rates);
  // Round converted amounts so they do not look exact: to 10 for rents, to 1 000 for sales.
  const rounded = item.kind === "sale" ? Math.round(value / 1000) * 1000 : Math.round(value / 10) * 10;
  return `≈ ${priceText(rounded, shown.currency, item.kind, lang)}`;
}

/** The listed price, shown small next to a converted one. */
export function original(item: Priced, lang: Lang): string | null {
  return converted(item) ? priceText(item.price, item.currency, item.kind, lang) : null;
}

/** "$900", "2.3k₾" for pins and small cards. */
export function moneyShort(item: Pick<CatalogItem, "price" | "currency">): string {
  if (item.price == null) return "•";
  const currency = converted(item) ? (shown.currency as Currency) : (item.currency as Currency);
  const v = converted(item) ? convert(item.price, item.currency, currency, shown.rates) : item.price;
  const n = shortNumber(v);
  const sign = CURRENCY_SIGN[currency] ?? "$";
  return currency === "GEL" || currency === "RUB" ? `${n}${sign}` : `${sign}${n}`;
}
