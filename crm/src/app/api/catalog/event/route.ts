import { EVENT_KINDS, asSource, recordEvent, type EventKind } from "@/lib/catalogEvents";

/** One mini app action: { kind: open | view | save | share, source, ref? }.  Leads are counted by /api/catalog/lead. */
export async function POST(request: Request) {
  const body = ((await request.json().catch(() => ({}))) ?? {}) as { kind?: string; source?: string; ref?: number };
  const kind = body.kind as EventKind;
  if (!EVENT_KINDS.includes(kind) || kind === "lead") return Response.json({ ok: false }, { status: 400 });
  const ref = Number.isInteger(body.ref) && body.ref! > 0 ? body.ref! : null;
  await recordEvent(kind, asSource(body.source), ref).catch(() => undefined);
  return Response.json({ ok: true });
}
