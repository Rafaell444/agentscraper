import { extUser } from "@/lib/ext";
import { dispatchCollectorIfDue } from "@/lib/collectorDispatch";
import { pruneRelayPages } from "@/lib/relay";

/** POST after a batch of pages: start the collector so it reads them (at most every 5 minutes). */
export async function POST(request: Request) {
  const user = await extUser(request);
  if (!user) return Response.json({ ok: false, error: "bad key" }, { status: 401 });
  const started = await dispatchCollectorIfDue(5 * 60_000).catch(() => false);
  await pruneRelayPages().catch(() => undefined);
  return Response.json({ ok: true, collector: started });
}
