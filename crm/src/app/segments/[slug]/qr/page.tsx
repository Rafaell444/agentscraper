import { notFound } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { requireUser } from "@/lib/auth";
import { segmentBySlug } from "@/lib/segments";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SegmentQrPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;
  const segment = segmentBySlug(slug);
  if (!segment) notFound();
  const settings = await getSettings();
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = settings.public_base_url.replace(/\/$/, "") || `${proto}://${host}`;
  const url = `${base}/p/${slug}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, width: 360, errorCorrectionLevel: "M" });

  return (
    <div className="mx-auto max-w-md print:max-w-none">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <a href={`/segments/${slug}`} className="ui-btn ui-btn-ghost ui-btn-sm">← უკან</a>
        <span className="text-xs text-gray-500">Ctrl+P / ⌘P — ბეჭდვა</span>
      </div>
      <div className="ui-card p-8 text-center print:border-0 print:shadow-none">
        <div className="text-2xl font-bold text-gray-900">{settings.agency_name || "Real estate agency"}</div>
        <div className="mt-1 text-lg text-gray-700">{segment.titleEn}</div>
        <div className="mt-6 flex justify-center" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="mt-6 text-base font-medium text-gray-800">Scan to see current rentals</div>
        <div className="mt-1 text-sm text-gray-500">{url}</div>
        {settings.agency_phone ? <div className="mt-4 text-lg font-semibold text-emerald-700">📞 {settings.agency_phone}</div> : null}
        {settings.agency_whatsapp ? <div className="text-sm text-gray-600">WhatsApp: +{settings.agency_whatsapp.replace(/^\+/, "")}</div> : null}
      </div>
    </div>
  );
}
