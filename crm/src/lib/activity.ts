import { prisma } from "./db";

export async function logActivity(userId: string, type: string, listingId?: string | null, detail?: string) {
  await prisma.activity.create({
    data: { userId, type, listingId: listingId ?? null, detail: detail ?? null },
  });
}
