import { getSession } from "@/lib/auth";
import { postTikTokWithChoices, tiktokCreator, tiktokDraft, type TikTokChoices } from "@/lib/social";
import { notifyPublished } from "@/lib/publishNotice";

// The TikTok posting window (components/TikTokPost): what it shows, and posting with the person's choices.
export const maxDuration = 120;

/** GET ?post=ID → the connected account (name, avatar, allowed privacy levels) and the post's text and photos. */
export async function GET(request: Request) {
  if (!(await getSession())) return Response.json({ ok: false, error: "შესვლა საჭიროა" }, { status: 401 });
  const postId = new URL(request.url).searchParams.get("post") ?? "";
  try {
    const [creator, draft] = await Promise.all([tiktokCreator(), tiktokDraft(postId)]);
    return Response.json({ ok: true, creator, draft });
  } catch (error) {
    return Response.json({ ok: false, error: String((error as Error).message || error).slice(0, 300) });
  }
}

/** POST { postId, title, description, privacy, allowComment, brandOrganic, brandContent } → posts to TikTok. */
export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return Response.json({ ok: false, error: "შესვლა საჭიროა" }, { status: 401 });
  const body = ((await request.json().catch(() => ({}))) ?? {}) as Partial<TikTokChoices> & { postId?: string };
  const postId = String(body.postId ?? "");
  try {
    const result = await postTikTokWithChoices(postId, {
      title: String(body.title ?? ""),
      description: String(body.description ?? ""),
      privacy: String(body.privacy ?? ""),
      allowComment: body.allowComment === true,
      brandOrganic: body.brandOrganic === true,
      brandContent: body.brandContent === true,
    });
    if (result.ok) await notifyPublished(user.id, postId, [result.message], { app: false, tg: false, networks: ["tt"] }).catch(() => undefined);
    return Response.json(result);
  } catch (error) {
    return Response.json({ ok: false, message: `🎵 TikTok: ${String((error as Error).message || error).slice(0, 300)}` });
  }
}
