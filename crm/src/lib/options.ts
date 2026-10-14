export type StatusOption = { value: string; label: string; color: string };

// Lead pipeline.  Order matters: it is the funnel order on the dashboard.
export const STATUSES: StatusOption[] = [
  { value: "new", label: "ახალი", color: "bg-sky-100 text-sky-800" },
  { value: "called", label: "დარეკილი", color: "bg-indigo-100 text-indigo-800" },
  { value: "no_answer", label: "არ პასუხობს", color: "bg-amber-100 text-amber-800" },
  { value: "interested", label: "დაინტერესდა", color: "bg-emerald-100 text-emerald-800" },
  { value: "meeting", label: "შეხვედრა", color: "bg-teal-100 text-teal-800" },
  { value: "signed", label: "ხელშეკრულება", color: "bg-green-200 text-green-900" },
  { value: "rejected", label: "უარი", color: "bg-rose-100 text-rose-800" },
  { value: "irrelevant", label: "არარელევანტური", color: "bg-gray-200 text-gray-700" },
];

export const STATUS_BY_VALUE = Object.fromEntries(STATUSES.map((s) => [s.value, s]));

export function statusLabel(value: string | null | undefined): string {
  return STATUS_BY_VALUE[value ?? "new"]?.label ?? value ?? "ახალი";
}

export function statusColor(value: string | null | undefined): string {
  return STATUS_BY_VALUE[value ?? "new"]?.color ?? "bg-gray-100 text-gray-700";
}

export const PRIORITIES = [
  { value: 0, label: "ჩვეულებრივი" },
  { value: 1, label: "მაღალი" },
  { value: 2, label: "სასწრაფო" },
];

export const SITE_COLORS: Record<string, string> = {
  myhome: "#1E915A",
  ssge: "#2563EB",
  binebi: "#D97706",
  place: "#7C3AED",
  housing: "#DB2777",
  makler: "#64748B",
};

export const PAGE_SIZE = 50;
