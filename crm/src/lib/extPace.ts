import { prisma } from "./db";

export type PaceRow = { pace: number; runs: number; tried: number; found: number; hours: number; logouts: number; perLogout: number | null };

/**
 * What each pause did over the last 30 days: listings tried, numbers found,
 * MyHome logouts.  The safe pause is the shortest one with plenty of listings
 * behind it and no logout.
 */
export async function paceAnalytics(days = 30): Promise<{ rows: PaceRow[]; safest: number | null; lastLogout: { pace: number; at: Date } | null }> {
  const since = new Date(Date.now() - days * 86400_000);
  const logs = await prisma.extPaceLog.findMany({ where: { createdAt: { gte: since } }, select: { pace: true, tried: true, found: true, seconds: true, loggedOut: true, createdAt: true } });
  const byPace = new Map<number, PaceRow>();
  for (const log of logs) {
    const row = byPace.get(log.pace) ?? { pace: log.pace, runs: 0, tried: 0, found: 0, hours: 0, logouts: 0, perLogout: null };
    row.runs += 1;
    row.tried += log.tried;
    row.found += log.found;
    row.hours += log.seconds / 3600;
    if (log.loggedOut) row.logouts += 1;
    byPace.set(log.pace, row);
  }
  const rows = [...byPace.values()].sort((a, b) => a.pace - b.pace);
  for (const row of rows) row.perLogout = row.logouts ? Math.round(row.tried / row.logouts) : null;
  // 150+ listings without a single logout counts as proven.
  const safest = rows.find((row) => row.logouts === 0 && row.tried >= 150)?.pace ?? null;
  const last = logs.filter((log) => log.loggedOut).sort((a, b) => +b.createdAt - +a.createdAt)[0];
  return { rows, safest, lastLogout: last ? { pace: last.pace, at: last.createdAt } : null };
}
