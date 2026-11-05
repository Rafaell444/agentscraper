import { prisma } from "@/lib/db";
import { watermark } from "@/lib/watermark";
import { photoSigValid } from "@/lib/social";

/**
 * A watermarked JPEG for Facebook / Instagram / Threads / TikTok to download;
 * signed, so only links the CRM made work.  ?w=1440 caps the width (Threads
 * refuses photos wider than 1440 px).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  if (!photoSigValid(id, query.get("s"))) return new Response("Not found", { status: 404 });
  const photo = await prisma.sharedPostPhoto.findUnique({ where: { id }, select: { data: true } });
  if (!photo) return new Response("Not found", { status: 404 });
  const marked = await watermark(photo.data);
  let data: Uint8Array = new Uint8Array(marked.data);
  const width = Math.min(4096, Math.max(320, Number(query.get("w")) || 0));
  if (query.get("w")) {
    try {
      const sharp = (await import("sharp")).default;
      data = new Uint8Array(await sharp(data).resize({ width, withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toBuffer());
    } catch {
      // keep the full-size photo
    }
  }
  return new Response(new Uint8Array(data), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" } });
}
