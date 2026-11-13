import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { shareBase } from "@/lib/shareUrl";
import { Button, Card, Input, PageHeader, Select } from "@/components/ui";
import { Tx } from "@/lib/partnerText";
import { EN_TYPE } from "@/lib/segments";
import { myPostCaption } from "@/lib/socialCopy";
import { deleteMyPost, updateMyPost } from "../../actions";
import { ShareFlat } from "../../ShareFlat";
import { MyPhotos } from "./MyPhotos";

export const dynamic = "force-dynamic";

const DEALS = [
  { value: "ქირავდება", label: "Rent (monthly)" },
  { value: "ქირავდება დღიურად", label: "Daily rent" },
  { value: "იყიდება", label: "Sale" },
];

/** The partner's own post (only for his WhatsApp group), in English. */
export default async function MyPostPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; from?: string }> }) {
  const me = await requireMember();
  const { id } = await params;
  const { saved, from } = await searchParams;
  const post = await prisma.sharedPost.findUnique({ where: { id }, include: { photos: { orderBy: [{ position: "asc" }, { id: "asc" }], select: { id: true, kind: true } } } });
  if (!post || post.createdById !== me.id || post.catalog) notFound();
  const base = await shareBase((await getSettings()).public_base_url);
  const link = `${base}/s/${post.token}`;
  const photos = post.photos.map((p) => ({ id: p.id, url: `/s/${post.token}/photo/${p.id}` }));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/share?kind=mine" className="ui-btn ui-btn-ghost ui-btn-sm -ml-2">← My posts</Link>
      <PageHeader
        title={<Tx p ka="" en="My post" hi="मेरी पोस्ट" />}
        subtitle="Only for your WhatsApp group. It does not go to our app, Telegram or social networks. Write in English."
      />
      {saved ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">Saved.</p> : null}
      {from === "listing" ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Filled in from the listing. Check the title and write the description in English, then save.</p> : null}

      <Card title={<Tx p ka="" en="Share" hi="शेयर करें" />}>
        <ShareFlat refNo={0} text={myPostCaption(post, link)} photos={photos.slice(0, 6).map((p) => p.url)} />
      </Card>

      <Card title={<Tx p ka="" en="Photos" hi="फ़ोटो" />}>
        <MyPhotos postId={post.id} photos={photos} />
      </Card>

      <Card title={<Tx p ka="" en="Details" hi="जानकारी" />}>
        <form action={updateMyPost} className="grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="id" value={post.id} />
          <Input name="title" defaultValue={post.title} required placeholder="Title, e.g. Bright 2-room flat in Vake" className="sm:col-span-2" />
          <Select name="dealType" defaultValue={post.dealType ?? "ქირავდება"}>
            {DEALS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
          <Select name="propertyType" defaultValue={post.propertyType ?? "ბინა"}>
            {Object.entries(EN_TYPE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
          <Input name="location" defaultValue={post.location ?? ""} placeholder="Area / street, e.g. Saburtalo, Pekini St" className="sm:col-span-2" />
          <div className="flex gap-2">
            <Input name="price" defaultValue={post.price ?? ""} placeholder="Price" inputMode="numeric" />
            <Select name="currency" defaultValue={post.currency} className="w-24">
              <option value="USD">$</option>
              <option value="GEL">₾</option>
            </Select>
          </div>
          <Input name="area" defaultValue={post.area ?? ""} placeholder="Area, m²" inputMode="numeric" />
          <Input name="rooms" defaultValue={post.rooms ?? ""} placeholder="Rooms" inputMode="numeric" />
          <Input name="bedrooms" defaultValue={post.bedrooms ?? ""} placeholder="Bedrooms" inputMode="numeric" />
          <Input name="bathrooms" defaultValue={post.bathrooms ?? ""} placeholder="Bathrooms" inputMode="numeric" />
          <div className="flex gap-2">
            <Input name="floor" defaultValue={post.floor ?? ""} placeholder="Floor" inputMode="numeric" />
            <Input name="totalFloors" defaultValue={post.totalFloors ?? ""} placeholder="of floors" inputMode="numeric" />
          </div>
          <textarea name="description" defaultValue={post.description ?? ""} rows={6} placeholder="Description in English" className="ui-field h-auto py-2 sm:col-span-2" />
          <Input name="contactName" defaultValue={post.contactName ?? me.name} placeholder="Your name" />
          <Input name="contactPhone" defaultValue={post.contactPhone ?? ""} placeholder="Your WhatsApp number" />
          <Button type="submit" className="sm:col-span-2">Save</Button>
        </form>
      </Card>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <a href={link} target="_blank" rel="noreferrer" className="underline">Open the page clients see ↗</a>
        <form action={deleteMyPost}>
          <input type="hidden" name="id" value={post.id} />
          <Button type="submit" size="sm" variant="danger">Delete post</Button>
        </form>
      </div>
    </div>
  );
}
