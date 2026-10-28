import { prisma } from "@/lib/db";

/** Count a mini-app view of one listing. */
export async function POST(request: Request) {
  const { ref } = ((await request.json().catch(() => ({}))) ?? {}) as { ref?: number };
  if (ref && Number.isInteger(ref)) {
    await prisma.sharedPost.updateMany({ where: { refNo: ref, catalog: true }, data: { catalogViews: { increment: 1 } } });
  }
  return Response.json({ ok: true });
}
