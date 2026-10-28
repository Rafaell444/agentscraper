import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

/** Banner photo, CRM users only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return new Response("Not found", { status: 404 });
  const { id } = await params;
  const photo = await prisma.bannerPhoto.findUnique({ where: { id }, select: { mime: true, data: true } });
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(photo.data), { headers: { "Content-Type": photo.mime, "Cache-Control": "private, max-age=86400" } });
}
