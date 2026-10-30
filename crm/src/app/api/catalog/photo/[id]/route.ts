import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isPublic as shownPublicly } from "@/lib/catalog";

/** A photo of a catalog listing: public while the listing is in the catalog
 * (CRM users always see it).  Cached by the CDN — photos never change in
 * place; a new upload gets a new id. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const photo = await prisma.sharedPostPhoto.findUnique({
    where: { id },
    select: { mime: true, data: true, post: { select: { catalog: true, availability: true, closedAt: true } } },
  });
  if (!photo) return new Response("Not found", { status: 404 });
  const isPublic = shownPublicly(photo.post);
  if (!isPublic && !(await getSession())) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(photo.data), {
    headers: {
      "Content-Type": photo.mime,
      "Cache-Control": isPublic ? "public, max-age=86400, s-maxage=604800" : "private, max-age=600",
    },
  });
}
