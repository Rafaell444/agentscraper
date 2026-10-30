// Brand watermark on listing photos, so other agents cannot reuse them:
// a faint round logo in the middle (hard to crop away) and a small label in
// the bottom-right corner with the logo, "© <agency>" and the channel
// username.  Used for photos served to the mini app / website / bot and for
// photos posted to the Telegram channels.  The label is drawn with next/og
// (its bundled font), so it renders the same on Vercel as locally.

import { ImageResponse } from "next/og";
import { BRAND_MARK_PNG } from "./brandMark";
import { getSettings } from "./settings";

const MARK = Buffer.from(BRAND_MARK_PNG, "base64");
const MARK_URI = `data:image/png;base64,${BRAND_MARK_PNG}`;
const labels = new Map<string, Promise<Buffer>>();
const BRAND = "Tbilisi Home";

/** "@TbilisiBuyRent" from the channel setting ("@x", "https://t.me/x" or a numeric id). */
function handle(value: string): string {
  const name = value.trim().replace(/^https?:\/\/t\.me\//, "").replace(/^@/, "");
  return /^[A-Za-z][\w]{3,}$/.test(name) ? `@${name}` : "";
}

/** The corner label as a transparent PNG, cached per size and text. */
function label(width: number, agency: string, channel: string): Promise<Buffer> {
  const key = `${width}|${agency}|${channel}`;
  let hit = labels.get(key);
  if (!hit) {
    const height = Math.round(width * 0.2);
    const logo = Math.round(height * 0.78);
    hit = new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", padding: `0 ${Math.round(height * 0.22)}px 0 ${Math.round(height * 0.11)}px`, borderRadius: height / 2, background: "rgba(14,42,77,0.5)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={MARK_URI} width={logo} height={logo} style={{ borderRadius: logo / 2 }} />
          <div style={{ display: "flex", flexDirection: "column", marginLeft: Math.round(height * 0.16), color: "white", lineHeight: 1.1 }}>
            <div style={{ fontSize: Math.round(height * 0.3) }}>{`© ${agency}`}</div>
            {channel ? <div style={{ fontSize: Math.round(height * 0.24), opacity: 0.85 }}>{channel}</div> : null}
          </div>
        </div>
      ),
      { width, height },
    )
      .arrayBuffer()
      .then((b) => Buffer.from(b));
    labels.set(key, hit);
    hit.catch(() => labels.delete(key));
  }
  return hit;
}

/** The photo with the watermark, as JPEG; the original if anything goes wrong (never blocks a photo). */
export async function watermark(data: Uint8Array): Promise<{ data: Buffer; mime: string }> {
  try {
    // Loaded here: sharp comes with Next as an optional dependency; if it is ever missing, photos go out unmarked instead of failing.
    const sharp = (await import("sharp")).default;
    const settings = await getSettings();
    // The public brand of the channels and the mini app (the CRM's agency name may differ).
    const agency = BRAND;
    const channel = handle(settings.telegram_channel_en || settings.telegram_channel || "");
    const image = sharp(Buffer.from(data)).rotate();
    const meta = await image.metadata();
    const w = meta.autoOrient?.width ?? meta.width ?? 0;
    const h = meta.autoOrient?.height ?? meta.height ?? 0;
    if (w < 200 || h < 150) return { data: Buffer.from(data), mime: "image/jpeg" };

    // Small: about a quarter of the photo width.
    const corner = Math.round(Math.min(w * 0.27, h * 0.6, 520) / 10) * 10;
    const tag = await label(corner, agency, channel);
    const tagH = Math.round(corner * 0.2);
    const margin = Math.round(Math.min(w, h) * 0.03);

    // Centre: the badge at ~18% opacity.
    const size = Math.round(Math.min(w, h) * 0.3);
    const ghost = await sharp(MARK)
      .resize(size, size)
      .ensureAlpha()
      .composite([{ input: Buffer.from([255, 255, 255, 46]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: "dest-in" }])
      .png()
      .toBuffer();

    const out = await image
      .composite([
        { input: ghost, left: Math.round((w - size) / 2), top: Math.round((h - size) / 2) },
        { input: tag, left: w - corner - margin, top: h - tagH - margin },
      ])
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
    return { data: out, mime: "image/jpeg" };
  } catch {
    return { data: Buffer.from(data), mime: "image/jpeg" };
  }
}
