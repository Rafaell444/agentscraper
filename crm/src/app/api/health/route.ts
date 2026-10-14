import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [listings, users, latest] = await Promise.all([
      prisma.listing.count({ where: { archived: false } }),
      prisma.user.count(),
      prisma.listing.findFirst({ orderBy: { lastSyncAt: "desc" }, select: { lastSyncAt: true } }),
    ]);
    return NextResponse.json({ ok: true, listings, users, lastSync: latest?.lastSyncAt ?? null });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
