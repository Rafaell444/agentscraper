import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

/** A photo of a shared post: only through the post's secret token, and only
 * while the post is published (CRM users also see drafts). */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string; photoId: string }> }) {
  const { token, photoId } = await params;
  const photo = await prisma.sharedPostPhoto.findUnique({
    where: { id: photoId },
    select: { mime: true, data: true, post: { select: { token: true, status: true } } },
  });
  if (!photo || photo.post.token !== token) return new Response("Not found", { status: 404 });
  if (photo.post.status !== "published" && !(await getSession())) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(photo.data), {
    headers: {
      "Content-Type": photo.mime,
      "Cache-Control": "private, max-age=86400",
      "X-Robots-Tag": "noindex",
    },
  });
}
