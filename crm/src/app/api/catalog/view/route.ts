import { asSource, recordEvent } from "@/lib/catalogEvents";

/** Count a mini-app view of one listing (older app versions; new ones use /api/catalog/event). */
export async function POST(request: Request) {
  const { ref, source } = ((await request.json().catch(() => ({}))) ?? {}) as { ref?: number; source?: string };
  if (ref && Number.isInteger(ref)) await recordEvent("view", asSource(source), ref).catch(() => undefined);
  return Response.json({ ok: true });
}
