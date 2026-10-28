import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTOS = 10;
const MAX_BYTES = 4 * 1024 * 1024;

/** Agent uploads photos of a street banner (resized in the browser). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const banner = await prisma.streetBanner.findUnique({ where: { id }, select: { _count: { select: { photos: true } } } });
  if (!banner) return NextResponse.json({ error: "not found" }, { status: 404 });
  let room = MAX_PHOTOS - banner._count.photos;
  const files = (await request.formData()).getAll("file").filter((f): f is File => f instanceof File);
  for (const file of files) {
    if (room <= 0) break;
    if (!ALLOWED.has(file.type) || file.size === 0 || file.size > MAX_BYTES) continue;
    await prisma.bannerPhoto.create({ data: { bannerId: id, mime: file.type, data: Buffer.from(await file.arrayBuffer()) } });
    room -= 1;
  }
  return NextResponse.json({ full: room <= 0 });
}
