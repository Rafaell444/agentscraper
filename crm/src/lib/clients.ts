export const CLIENT_STATUSES = [
  { value: "new", label: "ახალი", color: "bg-sky-100 text-sky-800" },
  { value: "searching", label: "ვეძებთ", color: "bg-indigo-100 text-indigo-800" },
  { value: "viewing", label: "დათვალიერება", color: "bg-amber-100 text-amber-800" },
  { value: "closed_won", label: "დაქირავდა / იყიდა", color: "bg-green-200 text-green-900" },
  { value: "closed_lost", label: "დაიკარგა", color: "bg-gray-200 text-gray-700" },
];
export const CLIENT_STATUS = Object.fromEntries(CLIENT_STATUSES.map((s) => [s.value, s]));

export const CLIENT_SEGMENTS = [
  { value: "expat", label: "ექსპატი" },
  { value: "tourist", label: "ტურისტი" },
  { value: "indian", label: "ინდოელი" },
  { value: "local", label: "ადგილობრივი" },
  { value: "other", label: "სხვა" },
];

export const SHORTLIST_STATUSES = [
  { value: "proposed", label: "შეთავაზებული" },
  { value: "sent", label: "გაგზავნილი" },
  { value: "viewed", label: "ნახა" },
  { value: "liked", label: "მოეწონა" },
  { value: "rejected", label: "არ მოეწონა" },
  { value: "rented", label: "დაქირავდა" },
];

export function splitAreas(areas: string | null | undefined): string[] {
  return (areas ?? "")
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
}
