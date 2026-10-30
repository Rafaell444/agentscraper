import { nearbyFor } from "@/lib/nearby";

export const maxDuration = 60;

/** GET ?ref=1023 → shops, schools, parks… within ~10 minutes on foot. */
export async function GET(request: Request) {
  const ref = Number(new URL(request.url).searchParams.get("ref"));
  if (!Number.isInteger(ref) || ref <= 0) return Response.json({ ok: false }, { status: 400 });
  try {
    const nearby = await nearbyFor(ref);
    if (!nearby) return Response.json({ ok: false }, { status: 404 });
    return Response.json({ ok: true, ...nearby }, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
  } catch {
    return Response.json({ ok: false, error: "overpass" }, { status: 502 });
  }
}
