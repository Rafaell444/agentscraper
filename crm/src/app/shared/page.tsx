import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtDate, fmtMoney } from "@/lib/format";
import { POST_STATUS } from "@/lib/sharedPosts";
import { shareBase, shareLink } from "@/lib/shareUrl";
import { Card, EmptyState, Input, PageHeader, Select, Tabs } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";
import { SubmitButton } from "@/components/SubmitButton";
import { importPost } from "./actions";

export const dynamic = "force-dynamic";
// Import downloads the photos of the source ad.
export const maxDuration = 60;

export default async function SharedPostsPage({ searchParams }: { searchParams: Promise<{ status?: string; mine?: string }> }) {
  const me = await requireUser();
  const { status = "active", mine = "1" } = await searchParams;
  const where = {
    ...(status === "active" ? { status: { not: "archived" } } : { status }),
    ...(mine === "1" ? { createdById: me.id } : {}),
  };
  const [posts, clients, settings] = await Promise.all([
    prisma.sharedPost.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true, token: true, status: true, title: true, location: true, price: true, currency: true, views: true, lastViewedAt: true, createdAt: true,
        client: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
        photos: { orderBy: { position: "asc" }, take: 1, select: { id: true } },
      },
    }),
    prisma.client.findMany({ where: { status: { notIn: ["closed_won", "closed_lost"] } }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 300 }),
    getSettings(),
  ]);
  const base = await shareBase(settings.public_base_url);
  const qs = (patch: Record<string, string>) => `/shared?${new URLSearchParams({ status, mine, ...patch })}`;

  return (
    <div className="space-y-4">
      <PageHeader title="პოსტები კლიენტისთვის" subtitle="ჩასვი myhome.ge / binebi.ge / ss.ge განცხადების ბმული, შეცვალე ტექსტი და ნომერი და გაუგზავნე კლიენტს პირადი ბმული." />

      <Card title="ახალი პოსტი ბმულიდან">
        <form action={importPost} noValidate className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input name="url" type="text" inputMode="url" autoComplete="off" placeholder="https://www.myhome.ge/udzravi-qoneba/... ან https://binebi.ge/gancxadebebi/..." className="flex-1" />
          <Select name="clientId" defaultValue="" className="sm:w-56">
            <option value="">კლიენტი (არასავალდებულო)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <SubmitButton pending="იტვირთება… (ფოტოები)">შემოტანა</SubmitButton>
        </form>
        <p className="mt-2 text-xs text-gray-500">ცარიელი ბმულით იქმნება ცარიელი პოსტი, რომელსაც ხელით შეავსებ. ფოტოების და ტექსტის შეცვლა შემდეგ გვერდზე შეგიძლია — კლიენტი მხოლოდ გამოქვეყნების შემდეგ ხედავს.</p>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          items={[
            { value: "active", label: "აქტიური" },
            { value: "draft", label: "მონახაზი" },
            { value: "published", label: "გამოქვეყნებული" },
            { value: "archived", label: "არქივი" },
          ]}
          current={status}
          hrefFor={(value) => qs({ status: value })}
        />
        <Tabs items={[{ value: "1", label: "ჩემი" }, { value: "0", label: "ყველა აგენტის" }]} current={mine} hrefFor={(value) => qs({ mine: value })} />
      </div>

      {posts.length === 0 ? (
        <Card>
          <EmptyState title="პოსტები ჯერ არ არის" hint="ჩასვი განცხადების ბმული ზემოთ" />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => {
            const st = POST_STATUS[post.status] ?? POST_STATUS.draft;
            return (
              <div key={post.id} className="ui-card overflow-hidden">
                <Link href={`/shared/${post.id}`} className="block">
                  {post.photos[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/s/${post.token}/photo/${post.photos[0].id}`} alt="" className="h-40 w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-40 w-full items-center justify-center bg-gray-100 text-xs text-gray-400">ფოტო არ არის</div>
                  )}
                </Link>
                <div className="space-y-1.5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                    <span className="text-[11px] text-gray-500">👁 {post.views}{post.lastViewedAt ? ` · ${fmtDate(post.lastViewedAt, true)}` : ""}</span>
                  </div>
                  <Link href={`/shared/${post.id}`} className="block text-sm font-semibold text-gray-900 hover:text-emerald-700">{post.title}</Link>
                  <div className="text-xs text-gray-500">
                    {[post.price != null ? fmtMoney(post.price, post.currency === "GEL" ? "₾" : "$") : "", post.location].filter(Boolean).join(" · ")}
                  </div>
                  <div className="text-[11px] text-gray-400">
                    {post.createdBy.name} · {fmtDate(post.createdAt)}
                    {post.client ? <> · კლიენტი: <Link href={`/clients/${post.client.id}`} className="text-emerald-700 hover:underline">{post.client.name}</Link></> : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Link href={`/shared/${post.id}`} className="ui-btn ui-btn-primary ui-btn-sm">რედაქტირება</Link>
                    {post.status === "published" ? <CopyButton value={shareLink(base, post.token)} /> : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
