import { prisma } from "@/lib/db";
import { watermark } from "@/lib/watermark";
import { photoSigValid } from "@/lib/social";

/** A watermarked JPEG for Facebook / Instagram / Threads / TikTok to download; signed, so only links the CRM made work. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!photoSigValid(id, new URL(request.url).searchParams.get("s"))) return new Response("Not found", { status: 404 });
  const photo = await prisma.sharedPostPhoto.findUnique({ where: { id }, select: { data: true } });
  if (!photo) return new Response("Not found", { status: 404 });
  const marked = await watermark(photo.data);
  return new Response(new Uint8Array(marked.data), { headers: { "Content-Type": marked.mime, "Cache-Control": "public, max-age=86400" } });
}
