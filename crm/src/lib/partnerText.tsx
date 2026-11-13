// The partner (e.g. the agent for Indian clients) works in English, with a
// small Hindi hint next to headings; agency staff keep Georgian.

/** Georgian for staff, English for a partner. */
export function tx(partner: boolean, ka: string, en: string): string {
  return partner ? en : ka;
}

/** A heading: Georgian for staff; English plus a small Hindi hint for a partner. */
export function Tx({ p, ka, en, hi }: { p: boolean; ka: string; en: string; hi?: string }) {
  if (!p) return <>{ka}</>;
  return (
    <>
      {en}
      {hi ? <span className="ml-1.5 text-[11px] font-normal text-gray-400">{hi}</span> : null}
    </>
  );
}

export const CLIENT_STATUS_EN: Record<string, string> = {
  new: "New",
  searching: "Searching",
  viewing: "Viewing",
  closed_won: "Rented / bought",
  closed_lost: "Lost",
};

export const SEGMENT_EN: Record<string, string> = { expat: "Expat", tourist: "Tourist", indian: "Indian", local: "Local", other: "Other" };

/** Deal types are stored in Georgian (they match the listings). */
export const DEAL_EN: Record<string, string> = { "ქირავდება": "Rent", "ქირავდება დღიურად": "Daily rent", "იყიდება": "Sale" };

export const VIEWING_STATUS_EN: Record<string, string> = { planned: "Planned", done: "Done", cancelled: "Cancelled", no_show: "No-show" };
