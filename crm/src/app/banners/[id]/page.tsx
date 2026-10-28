import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { findPhoneMatches } from "@/lib/phones";
import { codeFor } from "@/lib/cadastre";
import { BANNER_DEALS, BANNER_STATUS, BANNER_TYPES } from "@/lib/banners";
import { mapView } from "@/lib/map";
import { fmtDate } from "@/lib/format";
import { Card, PageHeader, PhoneButton } from "@/components/ui";
import { PhoneField, PhoneMatchesButton } from "@/components/PhoneMatches";
import { SubmitButton } from "@/components/SubmitButton";
import { CadastralBox } from "@/components/CadastralBox";
import { deleteBanner, deleteBannerPhoto, setBannerStatus, updateBanner } from "../actions";
import { BannerPhotoUpload } from "./BannerPhotoUpload";

export const dynamic = "force-dynamic";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {children}
    </label>
  );
}

export default async function BannerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  await requireUser();
  const { id } = await params;
  const { saved } = await searchParams;
  const banner = await prisma.streetBanner.findUnique({
    where: { id },
    include: { createdBy: { select: { name: true } }, photos: { select: { id: true } } },
  });
  if (!banner) notFound();
  const [matches, code] = await Promise.all([findPhoneMatches(banner.phone, banner.id), codeFor(banner.address)]);
  const map = mapView(banner.lat, banner.lng, "exact");

  return (
    <div className="space-y-4">
      <PageHeader
        title={banner.address || "ქუჩის ბანერი"}
        subtitle={`${[banner.dealType, banner.propertyType].filter(Boolean).join(" · ")} · ${banner.createdBy.name} · ${fmtDate(banner.createdAt, true)}`}
        actions={<Link href="/banners" className="ui-btn ui-btn-ghost ui-btn-sm">← ყველა ბანერი</Link>}
      />
      {saved ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-900">✅ შენახულია.</div> : null}

      <Card title="ტელეფონი">
        <div className="flex flex-wrap items-center gap-2">
          <PhoneButton phone={banner.phone} size="md" />
          {matches.length ? <PhoneMatchesButton matches={matches} phone={banner.phone} /> : <span className="text-xs text-gray-500">ამ ნომრით CRM-ში სხვა არაფერია.</span>}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Object.entries(BANNER_STATUS).map(([value, s]) => (
            <form key={value} action={setBannerStatus}>
              <input type="hidden" name="id" value={banner.id} />
              <input type="hidden" name="status" value={value} />
              <button type="submit" className={`rounded-full px-3 py-1 text-xs font-semibold ${banner.status === value ? s.cls + " ring-2 ring-offset-1 ring-current" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{s.label}</button>
            </form>
          ))}
        </div>
      </Card>

      <Card title={`ფოტოები (${banner.photos.length})`}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {banner.photos.map((photo) => (
            <div key={photo.id} className="relative overflow-hidden rounded-lg border border-gray-200">
              <a href={`/api/banner-photos/${photo.id}`} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/banner-photos/${photo.id}`} alt="" className="h-36 w-full object-cover" />
              </a>
              <form action={deleteBannerPhoto} className="absolute right-1 top-1">
                <input type="hidden" name="id" value={photo.id} />
                <SubmitButton pending="…" className="ui-btn ui-btn-danger ui-btn-sm px-2" confirm="წავშალო ფოტო?">✕</SubmitButton>
              </form>
            </div>
          ))}
        </div>
        <div className="mt-2">
          <BannerPhotoUpload bannerId={banner.id} />
        </div>
      </Card>

      <Card title="საკადასტრო კოდი">
        <CadastralBox address={banner.address} code={code} back={`/banners/${banner.id}`} />
      </Card>

      <form action={updateBanner}>
        <input type="hidden" name="id" value={banner.id} />
        {banner.lat != null ? <input type="hidden" name="lat" value={banner.lat} /> : null}
        {banner.lng != null ? <input type="hidden" name="lng" value={banner.lng} /> : null}
        <Card title="დეტალები">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="მისამართი"><input name="address" defaultValue={banner.address} className="ui-field" /></Field>
            <Field label="რაიონი"><input name="district" defaultValue={banner.district ?? ""} className="ui-field" /></Field>
            <Field label="ტელეფონი"><PhoneField defaultValue={banner.phone ?? ""} excludeBannerId={banner.id} /></Field>
            <Field label="გარიგება">
              <select name="dealType" defaultValue={banner.dealType ?? ""} className="ui-select">
                <option value="">—</option>
                {BANNER_DEALS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="ქონების ტიპი">
              <select name="propertyType" defaultValue={banner.propertyType ?? ""} className="ui-select">
                <option value="">—</option>
                {BANNER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="ფასი, $"><input name="price" defaultValue={banner.price ?? ""} inputMode="numeric" className="ui-field" /></Field>
            <Field label="მესაკუთრის სახელი"><input name="ownerName" defaultValue={banner.ownerName ?? ""} className="ui-field" /></Field>
            <div className="sm:col-span-2">
              <Field label="კომენტარი"><textarea name="comment" defaultValue={banner.comment ?? ""} rows={3} className="ui-field" /></Field>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <SubmitButton pending="ინახება…">შენახვა</SubmitButton>
          </div>
        </Card>
      </form>

      {map ? (
        <Card title="რუკა" action={<a href={map.openUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-emerald-700 hover:underline">Google Maps ↗</a>}>
          <iframe title="map" src={map.embedUrl} className="h-64 w-full rounded-lg border border-gray-200" loading="lazy" referrerPolicy="no-referrer" />
        </Card>
      ) : null}

      <form action={deleteBanner}>
        <input type="hidden" name="id" value={banner.id} />
        <SubmitButton pending="იშლება…" className="ui-btn ui-btn-danger ui-btn-sm" confirm="წავშალო ეს ბანერი და მისი ფოტოები?">ბანერის წაშლა</SubmitButton>
      </form>
    </div>
  );
}
