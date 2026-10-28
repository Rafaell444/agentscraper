import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { filterOptions } from "@/lib/queries";
import { findPhoneMatchesMany } from "@/lib/phones";
import { codesFor } from "@/lib/cadastre";
import { BANNER_STATUS } from "@/lib/banners";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Card, EmptyState, PageHeader, PhoneButton, Tabs } from "@/components/ui";
import { PhoneMatchesButton } from "@/components/PhoneMatches";
import { BannerForm } from "./BannerForm";

export const dynamic = "force-dynamic";

export default async function BannersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requireUser();
  const { status = "open", q = "" } = await searchParams;
  const search = q.trim();
  const digits = search.replace(/\D/g, "");
  const [banners, options] = await Promise.all([
    prisma.streetBanner.findMany({
      where: {
        ...(status === "open" ? { status: { notIn: ["rejected", "listed"] } } : status === "all" ? {} : { status }),
        ...(search
          ? { OR: [{ address: { contains: search } }, { comment: { contains: search } }, ...(digits.length >= 4 ? [{ phoneDigits: { contains: digits } }] : [])] }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { createdBy: { select: { name: true } }, photos: { take: 1, select: { id: true } } },
    }),
    filterOptions(""),
  ]);
  const [matches, codes] = await Promise.all([
    findPhoneMatchesMany(banners.map((b) => ({ phone: b.phone, bannerId: b.id }))),
    codesFor(banners.map((b) => b.address)),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="ქუჩის ბანერები" subtitle="„იყიდება / ქირავდება“ ბანერები, რომლებსაც მესაკუთრეები კიდებენ. ჩაწერე ქუჩაში — CRM გეტყვის, ეს ნომერი სადმე უკვე თუ გვაქვს." />

      <Card title="ახალი ბანერი">
        <BannerForm districts={options.districts.map((d) => d.name).filter(Boolean)} />
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          items={[{ value: "open", label: "აქტიური" }, ...Object.entries(BANNER_STATUS).map(([value, s]) => ({ value, label: s.label })), { value: "all", label: "ყველა" }]}
          current={status}
          hrefFor={(value) => `/banners?${new URLSearchParams({ status: value, q })}`}
        />
        <form className="flex flex-1 gap-2" action="/banners">
          <input type="hidden" name="status" value={status} />
          <input name="q" defaultValue={q} placeholder="ძებნა: მისამართი, ნომერი, კომენტარი" className="ui-field min-w-0 flex-1" />
          <button className="ui-btn ui-btn-secondary ui-btn-sm" type="submit">ძებნა</button>
        </form>
      </div>

      <Card title={`ბანერები (${banners.length})`}>
        {banners.length === 0 ? (
          <EmptyState title="ბანერები ჯერ არ არის" hint="ჩაწერე პირველი ზემოთ" />
        ) : (
          <ul className="divide-y divide-gray-100">
            {banners.map((banner, index) => {
              const st = BANNER_STATUS[banner.status] ?? BANNER_STATUS.new;
              const code = codes.get(banner.address);
              return (
                <li key={banner.id} className="flex flex-wrap items-start gap-3 py-3 sm:flex-nowrap">
                  <Link href={`/banners/${banner.id}`} className="shrink-0">
                    {banner.photos[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/banner-photos/${banner.photos[0].id}`} alt="" className="h-16 w-20 rounded-md object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-16 w-20 items-center justify-center rounded-md bg-gray-100 text-[10px] text-gray-400">ფოტო არ არის</div>
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/banners/${banner.id}`} className="text-sm font-semibold text-gray-900 hover:text-emerald-700">{banner.address || "მისამართი არ არის"}</Link>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-gray-600">
                      {[banner.dealType, banner.propertyType, banner.district, banner.price ? fmtMoney(banner.price) : ""].filter(Boolean).join(" · ")}
                    </div>
                    {banner.comment ? <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{banner.comment}</p> : null}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                      <span>{banner.createdBy.name} · {fmtDate(banner.createdAt, true)}</span>
                      {code ? <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700">საკადასტრო: {code}</span> : null}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <PhoneButton phone={banner.phone} />
                    <PhoneMatchesButton matches={matches[index]} phone={banner.phone} />
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
