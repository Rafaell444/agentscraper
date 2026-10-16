import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { Button, Card, Chip, EmptyState, PageHeader, SiteBadge } from "@/components/ui";
import { deletePublication, setPublicationStatus } from "./actions";

export const dynamic = "force-dynamic";

const CHANNEL_LABEL: Record<string, string> = { telegram: "Telegram", facebook: "Facebook", website: "ვებსაიტი" };
const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  queued: { label: "რიგშია", cls: "bg-sky-100 text-sky-800" },
  posted: { label: "გამოქვეყნდა", cls: "bg-emerald-100 text-emerald-800" },
  failed: { label: "შეცდომა", cls: "bg-rose-100 text-rose-800" },
  manual: { label: "ხელით დასადები", cls: "bg-amber-100 text-amber-800" },
  cancelled: { label: "გაუქმდა", cls: "bg-gray-200 text-gray-600" },
};

export default async function PublishPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireUser();
  const { status = "" } = await searchParams;
  const [items, settings, counts] = await Promise.all([
    prisma.publication.findMany({
      where: status ? { status } : {},
      include: { listing: { select: { id: true, title: true, site: true, siteName: true, priceUsd: true, neighbourhood: true } }, createdBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    getSettings(),
    prisma.publication.groupBy({ by: ["status"], _count: true }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const configured = {
    telegram: Boolean(settings.telegram_channel),
    facebook: Boolean(settings.facebook_page_id),
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="გამოქვეყნება"
        subtitle="რიგში ჩასმული განცხადებები ჩვენი ნომრით ქვეყნდება Telegram-სა და Facebook-ზე ყოველ 30 წუთში; ვებსაიტებზე აგენტი ხელით დებს"
        actions={
          <>
            <Chip href="/publish" active={!status}>ყველა</Chip>
            <Chip href="/publish?status=queued" active={status === "queued"}>რიგშია {count("queued")}</Chip>
            <Chip href="/publish?status=manual" active={status === "manual"}>ხელით {count("manual")}</Chip>
            <Chip href="/publish?status=failed" active={status === "failed"}>შეცდომა {count("failed")}</Chip>
            <Chip href="/publish?status=posted" active={status === "posted"}>გამოქვეყნდა {count("posted")}</Chip>
          </>
        }
      />

      {!configured.telegram || !configured.facebook ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {!configured.telegram ? "Telegram არხი არ არის მითითებული. " : ""}
          {!configured.facebook ? "Facebook გვერდის ID არ არის მითითებული. " : ""}
          <Link href="/settings" className="font-medium underline">პარამეტრები →</Link> (ბოტის ტოკენი და Facebook ტოკენი GitHub-ის სეკრეტებში იწერება.)
        </div>
      ) : null}

      <Card>
        {items.length === 0 ? (
          <EmptyState title="რიგი ცარიელია" hint="განცხადების გვერდზე „გამოქვეყნება“ ბლოკით ჩასვით რიგში" />
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((item) => {
              const st = STATUS_LABEL[item.status] ?? { label: item.status, cls: "bg-gray-100" };
              return (
                <li key={item.id} className="flex flex-col gap-2 py-3 md:flex-row md:items-start">
                  <div className="w-full shrink-0 md:w-56">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold">{CHANNEL_LABEL[item.channel] ?? item.channel}</span>
                      {item.target ? <span className="text-[11px] text-gray-500">{item.target}</span> : null}
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                    </div>
                    <Link href={`/listings/${item.listingId}`} className="mt-1 block truncate text-sm font-medium text-gray-900 hover:text-emerald-700">
                      {item.listing.title ?? item.listingId}
                    </Link>
                    <div className="text-xs text-gray-500">
                      <SiteBadge site={item.listing.site} name={item.listing.siteName} /> {item.createdBy.name} · {fmtDate(item.createdAt, true)}
                      {item.postedAt ? ` · გამოქვეყნდა ${fmtDate(item.postedAt, true)}` : ""}
                    </div>
                    {item.error ? <div className="mt-1 text-xs text-rose-600">{item.error}</div> : null}
                  </div>
                  <pre className="min-w-0 flex-1 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs text-gray-800">{item.text}</pre>
                  <div className="flex shrink-0 flex-wrap gap-1 md:flex-col">
                    {item.status === "manual" || item.status === "failed" ? (
                      <form action={setPublicationStatus}>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="status" value="posted" />
                        <Button size="sm" type="submit">დავდე ✓</Button>
                      </form>
                    ) : null}
                    {item.status === "failed" ? (
                      <form action={setPublicationStatus}>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="status" value="queued" />
                        <Button size="sm" variant="secondary" type="submit">თავიდან</Button>
                      </form>
                    ) : null}
                    {item.status === "queued" ? (
                      <form action={setPublicationStatus}>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="status" value="cancelled" />
                        <Button size="sm" variant="secondary" type="submit">გაუქმება</Button>
                      </form>
                    ) : null}
                    <form action={deletePublication}>
                      <input type="hidden" name="id" value={item.id} />
                      <Button size="sm" variant="danger" type="submit">წაშლა</Button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
