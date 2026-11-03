import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { shareBase } from "@/lib/shareUrl";
import { connectTikTok } from "@/lib/social";

/** TikTok sends the admin back here after "Connect TikTok" with a one-time code. */
export async function GET(request: Request) {
  await requireAdmin();
  const url = new URL(request.url);
  const state = await prisma.setting.findUnique({ where: { key: "tiktok_oauth_state" } });
  let note = "ok:TikTok დაკავშირებულია.";
  if (!url.searchParams.get("code") || !state || state.value !== url.searchParams.get("state")) {
    note = `err:TikTok-ის დაკავშირება ვერ მოხერხდა (${url.searchParams.get("error_description") || url.searchParams.get("error") || "არასწორი პასუხი"}).`;
  } else {
    try {
      await connectTikTok(url.searchParams.get("code")!, await shareBase((await getSettings()).public_base_url));
    } catch (error) {
      note = `err:TikTok: ${String((error as Error).message).slice(0, 200)}`;
    }
  }
  redirect(`/channel?social=${encodeURIComponent(note)}#social`);
}
