import { extUser } from "@/lib/ext";
import { claimRelayRequests, storeRelayPage } from "@/lib/relay";

/** GET ?limit=40 → pages the collector could not download, for the extension to fetch. */
export async function GET(request: Request) {
  const user = await extUser(request);
  if (!user) return Response.json({ ok: false, error: "bad key" }, { status: 401 });
  const limit = Math.min(80, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 40));
  return Response.json({ ok: true, urls: await claimRelayRequests(limit) });
}

/** POST { url, html }: one page downloaded in the agent's browser. */
export async function POST(request: Request) {
  const user = await extUser(request);
  if (!user) return Response.json({ ok: false, error: "bad key" }, { status: 401 });
  const body = ((await request.json().catch(() => ({}))) ?? {}) as { url?: string; html?: string };
  const result = await storeRelayPage(String(body.url ?? ""), String(body.html ?? ""));
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
