import { runDueSchedules } from "@/lib/schedule";

// Publishes posts whose scheduled time has passed.  Called every ~10 minutes by
// .github/workflows/publish-scheduled.yml.  Calling it early or twice does no
// harm (only due jobs run, each once), so a secret is optional: with
// CRON_SECRET set, callers must send "Authorization: Bearer <secret>".

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ ok: false }, { status: 401 });
  const run = await runDueSchedules();
  return Response.json({ ok: true, ...run });
}

export const GET = handle;
export const POST = handle;
