import { prisma } from "./db";

// Same street word list as storage.py's street_token, so "შარტავას ქ. 43" and
// "შარტავა 43" give one key.
const STREET_NOISE = new Set(["ქ", "ქუჩა", "ქუჩაზე", "გამზ", "გამზირი", "გამზირზე", "ჩიხი", "შეს", "შესახვევი", "ხეივანი", "ხეივ", "მოედანი", "დასახლება", "დას", "კორპ", "ბინა", "მ/რ", "მკრ"]);

/** "street|number" for an address, or null when it has no street or house number. */
export function addressKey(address: string | null | undefined): string | null {
  const text = String(address ?? "").toLowerCase();
  const number = text.match(/\d+[ა-ჰa-z]?/)?.[0];
  if (!number) return null;
  // The longest word is the street name ("მიხეილ თამარაშვილის ქუჩა 6" and
  // "თამარაშვილი მ. 6" both give "თამარ"), not a first name before it.
  const words = text.replace(/[\d.,;:/()\-–№#]+/g, " ").split(/\s+/).filter((word) => word.length >= 4 && !STREET_NOISE.has(word));
  const street = words.sort((a, b) => b.length - a.length)[0];
  return street ? `${street.slice(0, 5)}|${number}` : null;
}

/** Codes for many addresses at once: address -> code. */
export async function codesFor(addresses: (string | null | undefined)[]): Promise<Map<string, string>> {
  const byKey = new Map<string, string[]>();
  for (const address of addresses) {
    const key = addressKey(address);
    if (key && address) byKey.set(key, [...(byKey.get(key) ?? []), address]);
  }
  const result = new Map<string, string>();
  if (!byKey.size) return result;
  const rows = await prisma.cadastralCode.findMany({ where: { addressKey: { in: Array.from(byKey.keys()) } } });
  for (const row of rows) for (const address of byKey.get(row.addressKey) ?? []) result.set(address, row.code);
  return result;
}

export async function codeFor(address: string | null | undefined): Promise<string | null> {
  return (await codesFor([address])).get(String(address ?? "")) ?? null;
}
