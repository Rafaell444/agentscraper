import { runDueSchedules } from "@/lib/schedule";
import { warmNearby } from "@/lib/nearby";
import { dispatchCollectorIfDue } from "@/lib/collectorDispatch";

// Publishes posts whose scheduled time has passed.  Called every ~10 minutes by
// .github/workflows/publish-scheduled.yml.  Calling it early or twice does no
// harm (only due jobs run, each once), so a secret is optional: with
// CRON_SECRET set, callers must send "Authorization: Bearer <secret>".

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ ok: false }, { status: 401 });
  const run = await runDueSchedules();
  // Every ~30 minutes: start the listings collector on GitHub (its own schedule is unreliable).
  const collector = await dispatchCollectorIfDue().catch(() => false);
  // Spare time goes to looking up "what's nearby" for flats that have none yet.
  const nearby = await warmNearby().catch(() => 0);
  return Response.json({ ok: true, ...run, nearby, collector });
}

export const GET = handle;
export const POST = handle;
