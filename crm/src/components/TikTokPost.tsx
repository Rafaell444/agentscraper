"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// The TikTok posting window.  TikTok's Content Sharing Guidelines for apps
// that post directly require it: the connected account is shown, the text
// can be edited, "who can see" has no default, comments and the
// commercial-content disclosure are the person's choice, and the Music Usage
// Confirmation is accepted by pressing Post.  English, as TikTok's reviewers
// watch it in the demo video.

type Creator = { nickname: string; username: string; avatar: string; privacyOptions: string[]; commentDisabled: boolean; audited: boolean };
type Draft = { title: string; description: string; photos: string[] };

const PRIVACY_LABEL: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Everyone",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me",
};

const MUSIC_URL = "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en";
const BRANDED_URL = "https://www.tiktok.com/legal/page/global/bc-policy/en";

export function TikTokPost({ postId, posted, ready }: { postId: string; posted: boolean; ready: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [creator, setCreator] = useState<Creator | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [privacy, setPrivacy] = useState("");
  const [allowComment, setAllowComment] = useState(false);
  const [disclose, setDisclose] = useState(false);
  const [yourBrand, setYourBrand] = useState(false);
  const [branded, setBranded] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError("");
    setResult(null);
    fetch(`/api/social/tiktok/compose?post=${encodeURIComponent(postId)}`)
      .then((r) => r.json())
      .then((json: { ok: boolean; error?: string; creator?: Creator; draft?: Draft }) => {
        if (!json.ok || !json.creator || !json.draft) return setError(json.error || "Could not reach TikTok");
        setCreator(json.creator);
        setTitle(json.draft.title);
        setDescription(json.draft.description);
        setPhotos(json.draft.photos);
      })
      .catch(() => setError("Could not reach TikTok"))
      .finally(() => setLoading(false));
  }, [open, postId]);

  // Branded content cannot be private.
  useEffect(() => {
    if (branded && privacy === "SELF_ONLY") setPrivacy("");
  }, [branded, privacy]);

  const discloseIncomplete = disclose && !yourBrand && !branded;
  const canPost = Boolean(creator && privacy && !discloseIncomplete && !sending && photos.length);

  async function post() {
    setSending(true);
    setResult(null);
    const response = await fetch("/api/social/tiktok/compose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, title, description, privacy, allowComment, brandOrganic: disclose && yourBrand, brandContent: disclose && branded }),
    }).catch(() => null);
    const json = ((await response?.json().catch(() => null)) ?? { ok: false, message: "Could not reach the CRM" }) as { ok: boolean; message: string };
    setResult(json);
    setSending(false);
    if (json.ok) router.refresh();
  }

  if (!ready) {
    return (
      <button type="button" disabled className="ui-btn ui-btn-secondary ui-btn-sm" title="TikTok is not connected (Channel page)">
        🎵 TikTok
      </button>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} disabled={posted} className="ui-btn ui-btn-secondary ui-btn-sm">
        🎵 TikTok
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Post to TikTok">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Post to TikTok</h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-gray-500 hover:bg-gray-100" aria-label="Close">✕</button>
            </div>

            {loading ? <p className="text-sm text-gray-500">Loading your TikTok account…</p> : null}
            {error ? <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900">{error}</p> : null}

            {creator && !loading ? (
              <div className="space-y-4 text-sm">
                <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {creator.avatar ? <img src={creator.avatar} alt="" className="h-11 w-11 rounded-full object-cover" /> : <span className="h-11 w-11 rounded-full bg-gray-200" />}
                  <div>
                    <div className="font-semibold text-gray-900">{creator.nickname || creator.username}</div>
                    <div className="text-xs text-gray-500">Posting to @{creator.username}</div>
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-xs font-semibold text-gray-700">Photos ({Math.min(photos.length, 35)})</div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {photos.slice(0, 35).map((url) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={url} src={url} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
                    ))}
                  </div>
                </div>

                <label className="block">
                  <span className="text-xs font-semibold text-gray-700">Title</span>
                  <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 90))} className="ui-field mt-1" />
                  <span className="text-[11px] text-gray-400">{title.length}/90</span>
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-gray-700">Description</span>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 4000))} rows={6} className="ui-field mt-1" />
                  <span className="text-[11px] text-gray-400">{description.length}/4000</span>
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-gray-700">Who can see this post</span>
                  <select value={privacy} onChange={(e) => setPrivacy(e.target.value)} className="ui-field mt-1">
                    <option value="" disabled>Select…</option>
                    {creator.privacyOptions.map((option) => (
                      <option key={option} value={option} disabled={(branded && disclose && option === "SELF_ONLY") || (!creator.audited && option !== "SELF_ONLY")}>
                        {PRIVACY_LABEL[option] ?? option}
                        {branded && disclose && option === "SELF_ONLY" ? " (not available for branded content)" : ""}
                      </option>
                    ))}
                  </select>
                  {!creator.audited ? <span className="mt-1 block text-[11px] text-amber-700">Until TikTok approves this app, posts can only be visible to you (Only me).</span> : null}
                </label>

                <label className={`flex items-center gap-2 ${creator.commentDisabled ? "opacity-50" : ""}`}>
                  <input type="checkbox" checked={allowComment && !creator.commentDisabled} disabled={creator.commentDisabled} onChange={(e) => setAllowComment(e.target.checked)} />
                  <span>Allow comments{creator.commentDisabled ? " (turned off in your TikTok settings)" : ""}</span>
                </label>

                <div className="rounded-xl border border-gray-200 p-3">
                  <label className="flex items-center justify-between gap-3">
                    <span>
                      <span className="font-semibold text-gray-900">Disclose post content</span>
                      <span className="block text-xs text-gray-500">Turn on to disclose that this post promotes goods or services in exchange for something of value.</span>
                    </span>
                    <input type="checkbox" checked={disclose} onChange={(e) => setDisclose(e.target.checked)} />
                  </label>
                  {disclose ? (
                    <div className="mt-3 space-y-2">
                      <label className="flex items-start gap-2">
                        <input type="checkbox" className="mt-1" checked={yourBrand} onChange={(e) => setYourBrand(e.target.checked)} />
                        <span><b>Your brand</b><span className="block text-xs text-gray-500">You are promoting yourself or your own business.</span></span>
                      </label>
                      <label className="flex items-start gap-2">
                        <input type="checkbox" className="mt-1" checked={branded} onChange={(e) => setBranded(e.target.checked)} />
                        <span><b>Branded content</b><span className="block text-xs text-gray-500">You are promoting another brand or a third party.</span></span>
                      </label>
                      {discloseIncomplete ? <p className="text-xs text-amber-700">You need to indicate if your content promotes yourself, a third party, or both.</p> : null}
                      {yourBrand || branded ? <p className="text-xs text-gray-600">Your photo will be labeled as “{branded ? "Paid partnership" : "Promotional content"}”.</p> : null}
                    </div>
                  ) : null}
                </div>

                <p className="text-xs text-gray-500">
                  By posting, you agree to TikTok&apos;s{" "}
                  {disclose && branded ? (
                    <>
                      <a href={BRANDED_URL} target="_blank" rel="noreferrer" className="underline">Branded Content Policy</a> and{" "}
                    </>
                  ) : null}
                  <a href={MUSIC_URL} target="_blank" rel="noreferrer" className="underline">Music Usage Confirmation</a>.
                </p>

                {result ? (
                  <p className={`rounded-lg p-3 text-sm ${result.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>
                    {result.message}
                    {result.ok ? <span className="block text-xs">It may take a few minutes for the post to appear on your TikTok profile.</span> : null}
                  </p>
                ) : null}

                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setOpen(false)} className="ui-btn ui-btn-ghost">{result?.ok ? "Close" : "Cancel"}</button>
                  {!result?.ok ? (
                    <button type="button" onClick={post} disabled={!canPost} className="ui-btn ui-btn-primary">
                      {sending ? "Posting…" : "Post"}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
