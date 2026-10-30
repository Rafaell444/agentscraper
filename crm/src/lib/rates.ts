// Today's exchange rates for the mini app's currency switch: the National
// Bank of Georgia first (official), open.er-api.com if NBG cannot be reached
// (its server sends an incomplete certificate chain, which some runtimes
// reject).  Both free, no key; cached for 6 hours.

import { FALLBACK_RATES, type Rates } from "./catalog";

type Result = Rates & { date: string | null; source: string };

const NBG = "https://nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/en/json/?currencies=USD&currencies=EUR&currencies=RUB";
const OPEN_ER = "https://open.er-api.com/v6/latest/GEL";

async function fromNbg(): Promise<Result> {
  const response = await fetch(NBG, { next: { revalidate: 21600 } });
  const [day] = (await response.json()) as { date: string; currencies: { code: string; quantity: number; rate: number }[] }[];
  const rate = (code: string) => {
    const c = day.currencies.find((x) => x.code === code);
    if (!c || !(c.rate > 0)) throw new Error(`nbg ${code}`);
    return c.rate / (c.quantity || 1);
  };
  return { USD: rate("USD"), GEL: 1, EUR: rate("EUR"), RUB: rate("RUB"), date: day.date.slice(0, 10), source: "nbg" };
}

async function fromOpenEr(): Promise<Result> {
  const response = await fetch(OPEN_ER, { next: { revalidate: 21600 } });
  // Units of each currency per 1 lari; we need lari per unit.
  const json = (await response.json()) as { result: string; rates: Record<string, number>; time_last_update_utc?: string };
  if (json.result !== "success") throw new Error("open.er-api");
  const per = (code: string) => {
    const v = json.rates[code];
    if (!(v > 0)) throw new Error(`open.er-api ${code}`);
    return 1 / v;
  };
  return { USD: per("USD"), GEL: 1, EUR: per("EUR"), RUB: per("RUB"), date: json.time_last_update_utc ? new Date(json.time_last_update_utc).toISOString().slice(0, 10) : null, source: "open.er-api" };
}

export async function getRates(): Promise<Result> {
  for (const source of [fromNbg, fromOpenEr]) {
    try {
      return await source();
    } catch (error) {
      console.warn("rates:", source.name, String((error as Error)?.cause ?? error));
    }
  }
  return { ...FALLBACK_RATES, date: null, source: "fallback" };
}
