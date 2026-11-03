// Posting a flat to our own Facebook Page, Instagram, Threads and TikTok
// accounts (English text, the first 10 watermarked photos).
//
// Tokens (Vercel environment variables):
//   META_PAGE_TOKEN    long-lived Page access token: pages_manage_posts,
//                      pages_read_engagement, instagram_basic,
//                      instagram_content_publish (Facebook + Instagram)
//   THREADS_TOKEN      long-lived Threads user token: threads_basic,
//                      threads_content_publish
//   TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET   the TikTok app; the account
//                      itself is connected once from the Channel page
// Settings: facebook_page_id (and optionally instagram_account_id).

import { createHmac } from "node:crypto";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { shareBase } from "./shareUrl";
import { captionLinks, ensureRefNo } from "./channel";
import { channelCaption, headline, priceText, dealKind, placeName } from "./catalog";

export const NETWORKS = ["fb", "ig", "th", "tt"] as const;
export type Network = (typeof NETWORKS)[number];
export const NETWORK_LABEL: Record<Network, string> = { fb: "📘 Facebook", ig: "📸 Instagram", th: "🧵 Threads", tt: "🎵 TikTok" };

const GRAPH = "https://graph.facebook.com/v21.0";
const THREADS = "https://graph.threads.net/v1.0";
const TIKTOK = "https://open.tiktokapis.com/v2";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type SocialPosts = Partial<Record<Network, { id: string; at: string; url?: string }>>;

export function parseSocial(value: string | null | undefined): SocialPosts {
  try {
    return value ? (JSON.parse(value) as SocialPosts) : {};
  } catch {
    return {};
  }
}

// ---- photos the networks download (they need a public https link) ----

function photoSig(id: string): string {
  return createHmac("sha256", process.env.AUTH_SECRET || "social").update(`social-photo:${id}`).digest("hex").slice(0, 24);
}

export function photoSigValid(id: string, sig: string | null): boolean {
  return Boolean(sig) && sig === photoSig(id);
}

async function photoUrls(postId: string, base: string): Promise<string[]> {
  const photos = await prisma.sharedPostPhoto.findMany({ where: { postId }, orderBy: [{ position: "asc" }, { id: "asc" }], take: 10, select: { id: true } });
  return photos.map((p) => `${base}/api/social/photo/${p.id}?s=${photoSig(p.id)}`);
}

// ---- text ----

/** The channel caption as plain text: links become "Label: https://…". */
function plainCaption(html: string): string {
  return html
    .replace(/<a href="([^"]+)">([^<]+)<\/a>/g, "$2: $1")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

type Post = NonNullable<Awaited<ReturnType<typeof loadPost>>>;

async function loadPost(postId: string) {
  return prisma.sharedPost.findUnique({ where: { id: postId } });
}

async function texts(post: Post) {
  const links = await captionLinks(post.refNo, "en", post.catalog);
  const full = plainCaption(channelCaption(post, "en", links));
  const link = links.details ?? links.catalog;
  // Threads allows 500 characters: headline, price, place and the link.
  const place = placeName(post.location || post.district, "en");
  const short = [`🏠 ${headline(post, "en")}`, `💰 ${priceText(post.price, post.currency, dealKind(post.dealType), "en")}`, place ? `📍 ${place}` : "", post.refNo ? `🆔 ${post.refNo}` : "", "", `👉 ${link}`]
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n")
    .slice(0, 500);
  return { full, short, title: headline(post, "en").slice(0, 90) };
}

// ---- configuration ----

export async function socialStatus(): Promise<Record<Network, { ready: boolean; hint: string }>> {
  const settings = await getSettings();
  const tiktok = await prisma.setting.findUnique({ where: { key: "tiktok_refresh_token" } });
  const meta = Boolean(process.env.META_PAGE_TOKEN) && Boolean(settings.facebook_page_id);
  return {
    fb: { ready: meta, hint: meta ? "" : "Vercel-ში META_PAGE_TOKEN და პარამეტრებში Facebook გვერდის ID" },
    ig: { ready: meta, hint: meta ? "" : "იგივე Meta ტოკენი; Instagram ბიზნეს ანგარიში Facebook გვერდზე მიბმული" },
    th: { ready: Boolean(process.env.THREADS_TOKEN), hint: process.env.THREADS_TOKEN ? "" : "Vercel-ში THREADS_TOKEN" },
    tt: {
      ready: Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET && tiktok?.value),
      hint: !process.env.TIKTOK_CLIENT_KEY ? "Vercel-ში TIKTOK_CLIENT_KEY / SECRET" : tiktok?.value ? "" : "„არხი და აპი“ → TikTok-ის დაკავშირება",
    },
  };
}

async function graphPost(url: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetch(url, { method: "POST", body: new URLSearchParams(params), signal: AbortSignal.timeout(60_000), cache: "no-store" });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
  if (!response.ok || json.error) throw new Error(json.error?.message || `HTTP ${response.status}`);
  return json;
}

async function graphGet(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), cache: "no-store" });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
  if (!response.ok || json.error) throw new Error(json.error?.message || `HTTP ${response.status}`);
  return json;
}

// ---- Facebook Page: one post with all photos ----

async function postFacebook(post: Post, photos: string[]): Promise<{ id: string; url?: string }> {
  const token = process.env.META_PAGE_TOKEN!;
  const page = (await getSettings()).facebook_page_id.trim();
  const { full } = await texts(post);
  const media: string[] = [];
  for (const url of photos) {
    const photo = await graphPost(`${GRAPH}/${page}/photos`, { url, published: "false", access_token: token });
    media.push(String(photo.id));
  }
  const params: Record<string, string> = { message: full, access_token: token };
  media.forEach((id, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
  const result = await graphPost(`${GRAPH}/${page}/feed`, params);
  const id = String(result.id);
  return { id, url: `https://www.facebook.com/${id}` };
}

// ---- Instagram: carousel (or one photo) ----

async function instagramAccount(token: string): Promise<string> {
  const settings = await getSettings();
  const fixed = (settings as Record<string, string>).instagram_account_id?.trim();
  if (fixed) return fixed;
  const page = await graphGet(`${GRAPH}/${settings.facebook_page_id.trim()}?fields=instagram_business_account&access_token=${encodeURIComponent(token)}`);
  const id = (page.instagram_business_account as { id?: string } | undefined)?.id;
  if (!id) throw new Error("Facebook გვერდზე Instagram ბიზნეს ანგარიში არ არის მიბმული");
  return id;
}

async function waitReady(statusUrl: string, field: string, done: string[]): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const status = String((await graphGet(statusUrl))[field] ?? "");
    if (done.includes(status)) return;
    if (/ERROR|EXPIRED/i.test(status)) throw new Error(`media ${status}`);
    await sleep(3000);
  }
}

async function postInstagram(post: Post, photos: string[]): Promise<{ id: string; url?: string }> {
  if (!photos.length) throw new Error("Instagram-ს ფოტო სჭირდება");
  const token = process.env.META_PAGE_TOKEN!;
  const ig = await instagramAccount(token);
  const caption = (await texts(post)).full.slice(0, 2200);
  let creation: string;
  if (photos.length === 1) {
    creation = String((await graphPost(`${GRAPH}/${ig}/media`, { image_url: photos[0], caption, access_token: token })).id);
  } else {
    const children: string[] = [];
    for (const url of photos) children.push(String((await graphPost(`${GRAPH}/${ig}/media`, { image_url: url, is_carousel_item: "true", access_token: token })).id));
    creation = String((await graphPost(`${GRAPH}/${ig}/media`, { media_type: "CAROUSEL", children: children.join(","), caption, access_token: token })).id);
  }
  await waitReady(`${GRAPH}/${creation}?fields=status_code&access_token=${encodeURIComponent(token)}`, "status_code", ["FINISHED", "PUBLISHED"]);
  const published = await graphPost(`${GRAPH}/${ig}/media_publish`, { creation_id: creation, access_token: token });
  const id = String(published.id);
  const link = await graphGet(`${GRAPH}/${id}?fields=permalink&access_token=${encodeURIComponent(token)}`).catch(() => ({}) as Record<string, unknown>);
  return { id, url: link.permalink ? String(link.permalink) : undefined };
}

// ---- Threads: carousel (or one photo), 500-character text ----

async function postThreads(post: Post, photos: string[]): Promise<{ id: string; url?: string }> {
  const token = process.env.THREADS_TOKEN!;
  const text = (await texts(post)).short;
  const me = await graphGet(`${THREADS}/me?fields=id,username&access_token=${encodeURIComponent(token)}`);
  const user = String(me.id);
  let creation: string;
  if (photos.length >= 2) {
    const children: string[] = [];
    for (const url of photos) children.push(String((await graphPost(`${THREADS}/${user}/threads`, { media_type: "IMAGE", image_url: url, is_carousel_item: "true", access_token: token })).id));
    creation = String((await graphPost(`${THREADS}/${user}/threads`, { media_type: "CAROUSEL", children: children.join(","), text, access_token: token })).id);
  } else if (photos.length === 1) {
    creation = String((await graphPost(`${THREADS}/${user}/threads`, { media_type: "IMAGE", image_url: photos[0], text, access_token: token })).id);
  } else {
    creation = String((await graphPost(`${THREADS}/${user}/threads`, { media_type: "TEXT", text, access_token: token })).id);
  }
  await waitReady(`${THREADS}/${creation}?fields=status&access_token=${encodeURIComponent(token)}`, "status", ["FINISHED", "PUBLISHED"]);
  const published = await graphPost(`${THREADS}/${user}/threads_publish`, { creation_id: creation, access_token: token });
  const id = String(published.id);
  const link = await graphGet(`${THREADS}/${id}?fields=permalink&access_token=${encodeURIComponent(token)}`).catch(() => ({}) as Record<string, unknown>);
  return { id, url: link.permalink ? String(link.permalink) : me.username ? `https://www.threads.net/@${me.username}` : undefined };
}

// ---- TikTok: photo post ----

export function tiktokAuthUrl(base: string, state: string): string {
  const query = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY ?? "",
    scope: "user.info.basic,video.publish",
    response_type: "code",
    redirect_uri: `${base}/api/social/tiktok`,
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${query}`;
}

async function saveTikTokTokens(json: Record<string, unknown>): Promise<void> {
  const access = String(json.access_token ?? "");
  const refresh = String(json.refresh_token ?? "");
  if (!access || !refresh) throw new Error(String(json.error_description || json.error || "TikTok token error"));
  const expires = new Date(Date.now() + (Number(json.expires_in) || 86400) * 1000 - 5 * 60_000).toISOString();
  for (const [key, value] of [["tiktok_access_token", access], ["tiktok_access_expires", expires], ["tiktok_refresh_token", refresh]]) {
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
}

async function tiktokToken(params: Record<string, string>): Promise<void> {
  const response = await fetch(`${TIKTOK}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY ?? "", client_secret: process.env.TIKTOK_CLIENT_SECRET ?? "", ...params }),
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  await saveTikTokTokens((await response.json().catch(() => ({}))) as Record<string, unknown>);
}

/** The "Connect TikTok" redirect: the one-time code becomes stored tokens. */
export async function connectTikTok(code: string, base: string): Promise<void> {
  await tiktokToken({ code, grant_type: "authorization_code", redirect_uri: `${base}/api/social/tiktok` });
}

async function tiktokAccess(): Promise<string> {
  const rows = await prisma.setting.findMany({ where: { key: { in: ["tiktok_access_token", "tiktok_access_expires", "tiktok_refresh_token"] } } });
  const get = (key: string) => rows.find((r) => r.key === key)?.value ?? "";
  if (get("tiktok_access_token") && new Date(get("tiktok_access_expires")) > new Date()) return get("tiktok_access_token");
  if (!get("tiktok_refresh_token")) throw new Error("TikTok არ არის დაკავშირებული");
  await tiktokToken({ grant_type: "refresh_token", refresh_token: get("tiktok_refresh_token") });
  return (await prisma.setting.findUniqueOrThrow({ where: { key: "tiktok_access_token" } })).value;
}

async function tiktokCall(path: string, token: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(`${TIKTOK}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
    cache: "no-store",
  });
  const json = (await response.json().catch(() => ({}))) as { data?: Record<string, unknown>; error?: { code?: string; message?: string } };
  if (!response.ok || (json.error?.code && json.error.code !== "ok")) throw new Error(json.error?.message || json.error?.code || `HTTP ${response.status}`);
  return json.data ?? {};
}

async function postTikTok(post: Post, photos: string[]): Promise<{ id: string; url?: string }> {
  if (!photos.length) throw new Error("TikTok-ს ფოტო სჭირდება");
  const token = await tiktokAccess();
  const creator = await tiktokCall("/post/publish/creator_info/query/", token, {});
  const options = (creator.privacy_level_options as string[] | undefined) ?? [];
  // Until TikTok approves the app, only private ("only me") posts are allowed.
  const privacy = options.includes("PUBLIC_TO_EVERYONE") ? "PUBLIC_TO_EVERYONE" : options[0] ?? "SELF_ONLY";
  const { full, title } = await texts(post);
  const data = await tiktokCall("/post/publish/content/init/", token, {
    post_info: { title, description: full.slice(0, 4000), privacy_level: privacy, disable_comment: false, auto_add_music: true },
    source_info: { source: "PULL_FROM_URL", photo_cover_index: 0, photo_images: photos.slice(0, 35) },
    post_mode: "DIRECT_POST",
    media_type: "PHOTO",
  });
  return { id: String(data.publish_id ?? "") };
}

// ---- entry point ----

const POSTERS: Record<Network, (post: Post, photos: string[]) => Promise<{ id: string; url?: string }>> = {
  fb: postFacebook,
  ig: postInstagram,
  th: postThreads,
  tt: postTikTok,
};

/** Post the flat to the given networks (skipping ones it is already on); one line per network for the CRM notice. */
export async function publishToSocial(postId: string, networks: readonly Network[]): Promise<{ ok: boolean; message: string }> {
  await ensureRefNo(postId);
  const post = await loadPost(postId);
  if (!post) return { ok: false, message: "პოსტი ვერ მოიძებნა" };
  const status = await socialStatus();
  const settings = await getSettings();
  const base = await shareBase(settings.public_base_url);
  if (!base.startsWith("https://")) return { ok: false, message: "სოციალური ქსელები ფოტოებს https მისამართიდან იწერენ — გახსენი CRM Vercel-ის მისამართიდან" };
  const photos = await photoUrls(postId, base);
  const done = parseSocial(post.socialPosts);
  const lines: string[] = [];
  let failed = 0;
  for (const network of networks) {
    if (done[network]) {
      lines.push(`${NETWORK_LABEL[network]}: უკვე დადებულია`);
      continue;
    }
    if (!status[network].ready) {
      lines.push(`${NETWORK_LABEL[network]}: არ არის დაყენებული (${status[network].hint})`);
      failed++;
      continue;
    }
    try {
      const result = await POSTERS[network](post, photos);
      done[network] = { id: result.id, at: new Date().toISOString(), url: result.url };
      await prisma.sharedPost.update({ where: { id: postId }, data: { socialPosts: JSON.stringify(done) } });
      lines.push(`${NETWORK_LABEL[network]}: გამოქვეყნდა`);
    } catch (error) {
      failed++;
      lines.push(`${NETWORK_LABEL[network]}: ${String((error as Error)?.message || error).slice(0, 200)}`);
    }
  }
  return { ok: failed < networks.length, message: lines.join(". ") };
}

/** Forget that a flat is on a network (after it was deleted there by hand), so it can be posted again. */
export async function forgetSocial(postId: string, network: Network): Promise<void> {
  const post = await loadPost(postId);
  if (!post) return;
  const done = parseSocial(post.socialPosts);
  delete done[network];
  await prisma.sharedPost.update({ where: { id: postId }, data: { socialPosts: Object.keys(done).length ? JSON.stringify(done) : null } });
}
