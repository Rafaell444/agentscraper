import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { shareBase } from "@/lib/shareUrl";
import { PUBLIC_AVAILABILITY, dealKind, headline, photoUrl, placeName, priceText, publicWhere } from "@/lib/catalog";
import { whatsappCaption } from "@/lib/socialCopy";
import { Card, Chip, EmptyState, PageHeader } from "@/components/ui";
import { Tx } from "@/lib/partnerText";
import { ShareFlat } from "./ShareFlat";

export const dynamic = "force-dynamic";

// Flats from the public catalog, ready to share into a WhatsApp group in
// English: photos + text in one tap.  WhatsApp has no way for an app to post
// into an ordinary group, so the agent shares and picks the group himself.

const KINDS = [
  { value: "rent", label: "Rent" },
  { value: "daily", label: "Daily" },
  { value: "sale", label: "Sale" },
] as const;

export default async function SharePage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requireMember();
  const { kind: chosen } = await searchParams;
  const kind = KINDS.some((k) => k.value === chosen) ? chosen! : "rent";
  const settings = await getSettings();
  const base = await shareBase(settings.public_base_url);
  const posts = await prisma.sharedPost.findMany({
    where: { AND: [publicWhere(), { availability: { in: PUBLIC_AVAILABILITY } }] },
    include: { photos: { where: { kind: { not: "plan" } }, orderBy: [{ position: "asc" }, { id: "asc" }], take: 6, select: { id: true } } },
    orderBy: [{ catalogAt: "desc" }, { createdAt: "desc" }],
    take: 120,
  });
  const flats = posts.filter((post) => dealKind(post.dealType) === kind).slice(0, 40);

  return (
    <div className="space-y-4">
      <PageHeader
        title={<Tx p ka="" en="Share to WhatsApp" hi="व्हाट्सऐप पर शेयर करें" />}
        subtitle="Tap “Share photos + text”, choose WhatsApp and your group. The text is in English and links to the flat page."
        actions={KINDS.map((k) => (
          <Chip key={k.value} href={`/share?kind=${k.value}`} active={kind === k.value}>{k.label}</Chip>
        ))}
      />
      {flats.length === 0 ? (
        <Card><EmptyState title="No flats here yet" hint="New flats appear as soon as the team publishes them." /></Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {flats.map((post) => {
            const link = `${base}/catalog?p=${post.refNo}&lang=en&src=s`;
            const place = placeName(post.location || post.district, "en");
            return (
              <li key={post.id} className="ui-card overflow-hidden">
                {post.photos[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl(post.photos[0].id)} alt="" className="h-44 w-full object-cover" loading="lazy" />
                ) : (
                  <div className="h-44 w-full bg-gray-100" />
                )}
                <div className="space-y-2 p-3">
                  <div>
                    <div className="text-xs font-semibold text-gray-400">ID {post.refNo}</div>
                    <div className="font-semibold text-gray-900">{headline(post, "en")}</div>
                    <div className="text-sm text-gray-600">
                      {priceText(post.price, post.currency, dealKind(post.dealType), "en")}
                      {place ? ` · ${place}` : ""}
                    </div>
                  </div>
                  <ShareFlat refNo={post.refNo ?? 0} text={whatsappCaption(post, link)} photos={post.photos.map((p) => photoUrl(p.id))} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
