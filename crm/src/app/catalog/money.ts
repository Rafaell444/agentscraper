// The price as the viewer wants to see it: as listed, or converted to $, ₾, €
// or ₽ at today's rate.  CatalogApp sets the choice while rendering, so every
// card, pin and page below it uses the same currency.

import { CURRENCY_SIGN, FALLBACK_RATES, convert, priceText, type CatalogItem, type Currency, type Lang, type Rates } from "@/lib/catalog";

let shown: { currency: Currency | ""; rates: Rates } = { currency: "", rates: FALLBACK_RATES };

export function setShownCurrency(currency: Currency | "", rates: Rates) {
  shown = { currency, rates };
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
  const n = v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : v >= 10_000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(Math.round(v));
  const sign = CURRENCY_SIGN[currency] ?? "$";
  return currency === "GEL" || currency === "RUB" ? `${n}${sign}` : `${sign}${n}`;
}
