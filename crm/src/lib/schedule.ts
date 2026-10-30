import { prisma } from "./db";
import { ensureRefNo, publishToChannel, refreshChannelPost } from "./channel";
import { alertMatchingClients } from "./clientAlerts";
import { notifyRecipients } from "./telegram";

// Scheduled publishing: a post can carry a time for the mini app and a time
// for the Telegram channels.  /api/cron/publish (called every ~10 minutes by
// GitHub Actions) publishes whatever is due.  Times are entered in Tbilisi time.

const TBILISI_OFFSET = 4 * 3600_000; // UTC+4 all year, no daylight saving

/** "2026-11-02T10:00" (Tbilisi) from a datetime-local input → Date. */
export function parseTbilisi(value: string | null | undefined): Date | null {
  const m = (value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - TBILISI_OFFSET);
}

/** Date → "2026-11-02T10:00" for a datetime-local input, in Tbilisi time. */
export function toTbilisiInput(date: Date | null | undefined): string {
  return date ? new Date(date.getTime() + TBILISI_OFFSET).toISOString().slice(0, 16) : "";
}

/** Date → "02.11 10:00" in Tbilisi time. */
export function fmtTbilisi(date: Date): string {
  const d = new Date(date.getTime() + TBILISI_OFFSET).toISOString();
  return `${d.slice(8, 10)}.${d.slice(5, 7)} ${d.slice(11, 16)}`;
}

export type ScheduleRun = { checked: number; app: number; telegram: number; errors: string[] };

export async function runDueSchedules(now = new Date()): Promise<ScheduleRun> {
  const due = await prisma.sharedPost.findMany({
    where: { OR: [{ scheduleAppAt: { lte: now } }, { scheduleTgAt: { lte: now } }] },
    select: { id: true, title: true, refNo: true, createdById: true, scheduleAppAt: true, scheduleTgAt: true },
    orderBy: { updatedAt: "asc" },
    take: 20,
  });
  const run: ScheduleRun = { checked: due.length, app: 0, telegram: 0, errors: [] };

  for (const post of due) {
    const notes: string[] = [];
    let failed = false;
    let refNo = post.refNo;

    // Claim each job first, so two runs at the same moment cannot both publish it.
    const appDue = post.scheduleAppAt && post.scheduleAppAt <= now
      ? (await prisma.sharedPost.updateMany({ where: { id: post.id, scheduleAppAt: { lte: now } }, data: { scheduleAppAt: null, catalog: true } })).count > 0
      : false;
    if (appDue) {
      refNo = await ensureRefNo(post.id);
      const alerted = await alertMatchingClients(post.id).catch(() => 0);
      notes.push(`📱 მინი აპში დაემატა${alerted ? ` (🔔 ${alerted} კლიენტს ეცნობა)` : ""}`);
      run.app++;
    }

    const tgDue = post.scheduleTgAt && post.scheduleTgAt <= now
      ? (await prisma.sharedPost.updateMany({ where: { id: post.id, scheduleTgAt: { lte: now } }, data: { scheduleTgAt: null } })).count > 0
      : false;
    if (tgDue) {
      const result = await publishToChannel(post.id).catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }));
      if (result.ok) {
        notes.push(`📣 ${result.message}`);
        run.telegram++;
      } else {
        notes.push(`⚠️ Telegram: ${result.error}`);
        run.errors.push(`${post.id}: ${result.error}`);
        failed = true;
      }
    } else if (appDue) {
      // Channel posts already out get the app link now that the flat is in the app.
      await refreshChannelPost(post.id);
    }

    if (!notes.length) continue;
    const name = `${refNo ? `#${refNo} ` : ""}${post.title}`;
    await prisma.notification.create({
      data: { userId: post.createdById, type: "system", title: `⏰ ${failed ? "ავტომატური გამოქვეყნება ვერ მოხერხდა" : "ავტომატურად გამოქვეყნდა"}: ${name}`, body: notes.join(" · "), link: `/shared/${post.id}` },
    });
    if (failed) await notifyRecipients(`⏰⚠️ ${name}\n${notes.join("\n")}`).catch(() => 0);
  }

  await prisma.setting.upsert({ where: { key: "schedule_last_run" }, create: { key: "schedule_last_run", value: now.toISOString() }, update: { value: now.toISOString() } });
  return run;
}

/** When the publisher last ran (null if never). */
export async function lastScheduleRun(): Promise<Date | null> {
  const row = await prisma.setting.findUnique({ where: { key: "schedule_last_run" } });
  return row ? new Date(row.value) : null;
}
