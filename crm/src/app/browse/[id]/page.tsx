import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtMoney, fmtNum } from "@/lib/format";
import { placeName } from "@/lib/catalog";
import { EN_CONDITION, EN_DEAL, EN_TYPE, en } from "@/lib/segments";
import { replacePhones } from "@/lib/sharedPosts";
import { englishTitle } from "@/lib/browse";
import { Button, Card } from "@/components/ui";
import { Tx } from "@/lib/partnerText";
import { createMyPostFromListing } from "@/app/share/actions";

export const dynamic = "force-dynamic";

function photoList(images: string | null, image: string | null): string[] {
  try {
    const list = JSON.parse(images ?? "[]");
    if (Array.isArray(list) && list.length) return list.filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, 20);
  } catch {}
  return image ? [image] : [];
}

/** One scraped listing for the partner: facts and photos, never the owner's number, name or the source link. */
export default async function BrowseListingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireMember();
  const { id } = await params;
  const l = await prisma.listing.findUnique({
    where: { id: decodeURIComponent(id) },
    select: { id: true, image: true, images: true, rooms: true, bedrooms: true, bathrooms: true, propertyType: true, dealType: true, condition: true, neighbourhood: true, district: true, address: true, priceUsd: true, priceGel: true, areaM2: true, floor: true, totalFloors: true, posterKind: true, siteName: true, description: true, collectedAt: true, archived: true },
  });
  if (!l) notFound();
  const photos = photoList(l.images, l.image);
  const description = l.description ? replacePhones(l.description) : "";
  const facts: [string, string][] = [
    ["Deal", en(EN_DEAL, l.dealType)],
    ["Type", en(EN_TYPE, l.propertyType)],
    ["Price", [fmtMoney(l.priceUsd), l.priceGel ? `${fmtNum(l.priceGel)} ₾` : ""].filter(Boolean).join(" · ")],
    ["Area", l.areaM2 ? `${fmtNum(l.areaM2)} m²` : ""],
    ["Rooms", l.rooms ? String(l.rooms) : ""],
    ["Bedrooms", l.bedrooms ? String(l.bedrooms) : ""],
    ["Bathrooms", l.bathrooms ? String(l.bathrooms) : ""],
    ["Floor", l.floor ? `${l.floor}${l.totalFloors ? ` of ${l.totalFloors}` : ""}` : ""],
    ["Condition", en(EN_CONDITION, l.condition)],
    ["District", placeName(l.neighbourhood || l.district, "en")],
    ["Address", placeName(replacePhones(l.address ?? ""), "en")],
    ["Posted by", l.posterKind === "agent" ? "Agent" : "Owner"],
    ["Found", `${fmtDate(l.collectedAt)} on ${l.siteName}`],
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/browse" className="ui-btn ui-btn-ghost ui-btn-sm -ml-2">← Listings</Link>
      <h1 className="text-2xl font-bold text-gray-900">{englishTitle(l)}</h1>
      {l.archived ? <p className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">This listing was removed from the site.</p> : null}

      {photos.length ? (
        <div className="flex snap-x gap-2 overflow-x-auto pb-1">
          {photos.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt="" className="h-56 w-auto shrink-0 snap-start rounded-lg object-cover" loading="lazy" referrerPolicy="no-referrer" />
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card title={<Tx p ka="" en="Details" hi="जानकारी" />} className="md:col-span-2">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            {facts.filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-gray-500">{k}</dt>
                <dd className="font-medium text-gray-900">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card title={<Tx p ka="" en="Share" hi="शेयर करें" />}>
          <p className="mb-2 text-xs text-gray-500">Make your own WhatsApp post from this flat. The owner’s number is not included; our team arranges viewings.</p>
          <form action={createMyPostFromListing}>
            <input type="hidden" name="listingId" value={l.id} />
            <Button type="submit" className="w-full">⭐ Make my post</Button>
          </form>
        </Card>
      </div>

      {description ? (
        <Card title={<Tx p ka="" en="Description (original language)" hi="विवरण" />}>
          <p className="whitespace-pre-wrap text-sm text-gray-700">{description}</p>
          <a href={`https://translate.google.com/?sl=auto&tl=en&op=translate&text=${encodeURIComponent(description.slice(0, 1500))}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-emerald-700 underline">
            Translate to English ↗
          </a>
        </Card>
      ) : null}
    </div>
  );
}
