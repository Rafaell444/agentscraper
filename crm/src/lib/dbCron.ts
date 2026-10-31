// The 10-minute publisher timer, run by the database itself (Supabase
// pg_cron + pg_net): GitHub Actions starts scheduled workflows hours late or
// not at all, so it cannot publish on time.  Postgres only; the CRM's
// "⏰ Scheduler" card turns it on with one click.

import { prisma } from "./db";
import { lastScheduleRun, runDueSchedules } from "./schedule";
import { dispatchCollectorIfDue } from "./collectorDispatch";

const JOB = "crm-publish";

export type DbCronStatus =
  | { kind: "unsupported"; reason: string }
  | { kind: "off" }
  | { kind: "on"; schedule: string; lastRun: Date | null; lastStatus: string | null };

const isPostgres = () => /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? "");

export async function dbCronStatus(): Promise<DbCronStatus> {
  if (!isPostgres()) return { kind: "unsupported", reason: "local SQLite database" };
  try {
    const jobs = await prisma.$queryRawUnsafe<{ jobid: bigint; schedule: string }[]>(`select jobid, schedule from cron.job where jobname = '${JOB}'`);
    if (!jobs.length) return { kind: "off" };
    const runs = await prisma.$queryRawUnsafe<{ status: string; start_time: Date }[]>(
      `select status, start_time from cron.job_run_details where jobid = ${Number(jobs[0].jobid)} order by start_time desc limit 1`,
    );
    return { kind: "on", schedule: jobs[0].schedule, lastRun: runs[0]?.start_time ?? null, lastStatus: runs[0]?.status ?? null };
  } catch (error) {
    // No cron schema yet = the extension is not on.
    return /cron/.test(String(error)) ? { kind: "off" } : { kind: "unsupported", reason: String(error).slice(0, 200) };
  }
}

/** Every 10 minutes the database calls /api/cron/publish on this CRM. */
export async function enableDbCron(base: string): Promise<{ ok: boolean; error?: string }> {
  if (!isPostgres()) return { ok: false, error: "მუშაობს მხოლოდ Supabase-ის (Postgres) ბაზაზე" };
  if (!/^https:\/\/[\w.-]+$/.test(base)) return { ok: false, error: `CRM-ის მისამართი უნდა იყოს https://… (ახლა: ${base})` };
  const url = `${base}/api/cron/publish`;
  const secret = process.env.CRON_SECRET;
  const headers = JSON.stringify(secret ? { Authorization: `Bearer ${secret}` } : {}).replace(/'/g, "''");
  try {
    await prisma.$executeRawUnsafe(`create extension if not exists pg_cron with schema pg_catalog`);
    await prisma.$executeRawUnsafe(`create extension if not exists pg_net with schema extensions`);
    await prisma.$executeRawUnsafe(`select cron.unschedule(jobid) from cron.job where jobname = '${JOB}'`);
    await prisma.$executeRawUnsafe(
      `select cron.schedule('${JOB}', '*/10 * * * *', $$ select net.http_get(url := '${url}', headers := '${headers}'::jsonb, timeout_milliseconds := 120000) $$)`,
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error).slice(0, 300) };
  }
}

export async function disableDbCron(): Promise<void> {
  if (!isPostgres()) return;
  await prisma.$executeRawUnsafe(`select cron.unschedule(jobid) from cron.job where jobname = '${JOB}'`).catch(() => undefined);
}

let lastLocalCheck = 0;

/**
 * Backup for the timer: when someone opens the mini app or the CRM, publish
 * what is due if the publisher has not run for 5 minutes.  Called inside
 * after(), so the visitor never waits for it.
 */
export async function runSchedulesIfStale(): Promise<void> {
  if (Date.now() - lastLocalCheck < 60_000) return;
  lastLocalCheck = Date.now();
  // The listings collector too: GitHub hardly ever starts it on its own schedule.
  await dispatchCollectorIfDue().catch(() => false);
  const last = await lastScheduleRun();
  if (last && Date.now() - last.getTime() < 5 * 60_000) return;
  await runDueSchedules();
}
