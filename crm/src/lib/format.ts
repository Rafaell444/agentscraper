const TZ = "Asia/Tbilisi";

export function fmtDate(value: Date | string | null | undefined, withTime = false): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ka-GE", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

export function fmtMoney(value: number | null | undefined, currency = "$"): string {
  if (value == null) return "";
  return `${currency}${Math.round(value).toLocaleString("en-US")}`;
}

export function fmtNum(value: number | null | undefined, digits = 0): string {
  if (value == null) return "";
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function dayKey(date: Date): string {
  // YYYY-MM-DD in Tbilisi time
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfToday(): Date {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

export function telHref(phone: string | null | undefined): string {
  const first = (phone ?? "").split(";")[0].trim();
  return first ? `tel:+995${first.replace(/^\+?995/, "")}` : "";
}

export function waHref(phone: string | null | undefined): string {
  const first = (phone ?? "").split(";")[0].trim();
  return first ? `https://wa.me/995${first.replace(/^\+?995/, "")}` : "";
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
