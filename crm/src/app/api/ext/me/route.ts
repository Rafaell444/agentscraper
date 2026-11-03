import { prisma } from "@/lib/db";
import { extUser, phoneQueueBreakdown } from "@/lib/ext";
import { relayStats } from "@/lib/relay";

/** The extension's "Connect" check: who the key belongs to and today's numbers. */
export async function GET(request: Request) {
  const user = await extUser(request);
  if (!user) return Response.json({ ok: false, error: "bad key" }, { status: 401 });
  const since = new Date(Date.now() - 24 * 3600_000);
  const [today, queue, relay] = await Promise.all([
    prisma.activity.count({ where: { userId: user.id, type: "phone", detail: { endsWith: "(extension)" }, createdAt: { gte: since } } }),
    phoneQueueBreakdown(),
    relayStats(),
  ]);
  return Response.json({ ok: true, name: user.name, today, waiting: queue.ready, later: queue.later, noneSeen: queue.noneSeen, relayWaiting: relay.waiting });
}
