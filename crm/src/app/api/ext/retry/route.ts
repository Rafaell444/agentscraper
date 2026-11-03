import { extUser, retryStoppedChecks } from "@/lib/ext";

/** POST from the extension's "turn back on": retry the listings the login stop left waiting. */
export async function POST(request: Request) {
  const user = await extUser(request);
  if (!user) return Response.json({ ok: false, error: "bad key" }, { status: 401 });
  return Response.json({ ok: true, retried: await retryStoppedChecks() });
}
