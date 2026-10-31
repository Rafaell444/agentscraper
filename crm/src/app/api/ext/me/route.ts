import { prisma } from "@/lib/db";
import { extUser, phoneQueueSize } from "@/lib/ext";

/** The extension's "Connect" check: who the key belongs to and today's numbers. */
export async function GET(request: Request) {
  const user = await extUser(request);
  if (!user) return Response.json({ ok: false, error: "bad key" }, { status: 401 });
  const since = new Date(Date.now() - 24 * 3600_000);
  const [today, waiting] = await Promise.all([
    prisma.activity.count({ where: { userId: user.id, type: "phone", detail: { endsWith: "(extension)" }, createdAt: { gte: since } } }),
    phoneQueueSize(),
  ]);
  return Response.json({ ok: true, name: user.name, today, waiting });
}
