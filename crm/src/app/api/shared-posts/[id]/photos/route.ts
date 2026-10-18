import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { MAX_PHOTOS, MAX_PHOTO_BYTES } from "@/lib/sharedPosts";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Agent uploads photos (already resized in the browser) to a shared post. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const post = await prisma.sharedPost.findUnique({ where: { id }, select: { id: true, _count: { select: { photos: true } } } });
  if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });
  const form = await request.formData();
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  const last = await prisma.sharedPostPhoto.findFirst({ where: { postId: id }, orderBy: { position: "desc" }, select: { position: true } });
  let position = (last?.position ?? -1) + 1;
  let room = MAX_PHOTOS - post._count.photos;
  let added = 0;
  for (const file of files) {
    if (room <= 0) break;
    if (!ALLOWED.has(file.type) || file.size === 0 || file.size > MAX_PHOTO_BYTES) continue;
    await prisma.sharedPostPhoto.create({ data: { postId: id, position: position++, mime: file.type, data: Buffer.from(await file.arrayBuffer()) } });
    room -= 1;
    added += 1;
  }
  return NextResponse.json({ added, full: room <= 0 });
}
