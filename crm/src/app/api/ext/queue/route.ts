import { extUser, phoneQueue } from "@/lib/ext";

/** GET ?limit=3 → the next MyHome listings to read a number from (taken for 6 hours). */
export async function GET(request: Request) {
  const user = await extUser(request);
  if (!user) return Response.json({ ok: false, error: "bad key" }, { status: 401 });
  const limit = Math.min(10, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 3));
  return Response.json({ ok: true, items: await phoneQueue(limit) });
}
