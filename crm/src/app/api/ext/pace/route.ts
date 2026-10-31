import { prisma } from "@/lib/db";
import { extUser } from "@/lib/ext";

const int = (value: unknown, max: number) => Math.min(max, Math.max(0, Math.round(Number(value) || 0)));

/** POST { pace, tried, found, seconds, loggedOut }: one run of the extension, for the pace analytics. */
export async function POST(request: Request) {
  const user = await extUser(request);
  if (!user) return Response.json({ ok: false, error: "bad key" }, { status: 401 });
  const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  const pace = int(body.pace, 3600);
  const tried = int(body.tried, 10_000);
  if (!pace || (!tried && body.loggedOut !== true)) return Response.json({ ok: true, skipped: true });
  await prisma.extPaceLog.create({
    data: { userId: user.id, pace, tried, found: int(body.found, 10_000), seconds: int(body.seconds, 86_400), loggedOut: body.loggedOut === true },
  });
  return Response.json({ ok: true });
}
