import { headers } from "next/headers";

/** Origin for links sent to clients: the configured public address, else this host. */
export async function shareBase(publicBaseUrl: string): Promise<string> {
  if (publicBaseUrl.trim()) return publicBaseUrl.trim().replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function shareLink(base: string, token: string): string {
  return `${base}/s/${token}`;
}
