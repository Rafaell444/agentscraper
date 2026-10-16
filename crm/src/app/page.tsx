import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { dashboardStats } from "@/lib/stats";
import { SITE_COLORS } from "@/lib/options";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Card, EmptyState, PageHeader, PhoneButton, SiteBadge, StatCard, StatusBadge, Tabs } from "@/components/ui";
import { POSTER_KINDS } from "@/lib/queries";
import { Donut, HBars, StackedBars } from "@/components/charts";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  const user = await requireUser();
  const { who = "owner" } = await searchParams;
  const stats = await dashboardStats(who);
  const { kpis } = stats;
  const q = `who=${who}`;
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tbilisi", hour: "numeric", hour12: false }).format(new Date()));
  const greeting = hour < 12 ? "დილა მშვიდობისა" : hour < 18 ? "დღე მშვიდობისა" : "საღამო მშვიდობისა";

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${greeting}, ${user.name.split(" ")[0]}`}
        subtitle={`თბილისის ახალი განცხადებები · ${who === "owner" ? "მესაკუთრეები" : who === "agent" ? "აგენტები" : "ყველა განმთავსებელი"} · ბოლო 30 დღე`}
        actions={
          <>
            <Tabs items={POSTER_KINDS} current={who} hrefFor={(value) => `/?who=${value}`} />
            <Link href={`/listings?${q}&days=1`} className="ui-btn ui-btn-primary ui-btn-sm">
              დღევანდელი {kpis.newToday}
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="დღეს ახალი" value={kpis.newToday} href={`/listings?${q}&days=1`} accent="emerald" />
        <StatCard label="7 დღეში" value={kpis.new7} href={`/listings?${q}&days=7`} accent="emerald" />
        <StatCard label="30 დღეში" value={kpis.new30} hint={`სულ აქტიური ${kpis.totalActive}`} href={`/listings?${q}&days=30`} accent="emerald" />
        <StatCard label="ტელეფონით" value={`${kpis.phonePct}%`} hint={`${kpis.withPhone} / ${kpis.totalActive}`} href={`/listings?${q}&phone=1`} accent="blue" />
        <StatCard label="უნიკალური ნომერი" value={kpis.uniquePhones} href={`/owners?${q}`} accent="blue" />
        <StatCard label="რამდენჯერმე განთავსებული" value={kpis.multiPosted} hint="იგივე ობიექტი სხვა საიტზე/განმთავსებლისგან" href={`/listings?${q}`} accent="amber" />
        <StatCard label="დაინტერესებული" value={kpis.interested} href={`/listings?${q}&status=interested`} accent="violet" />
        <StatCard label="ხელშეკრულება (თვე)" value={kpis.signedThisMonth} href={`/listings?${q}&status=signed`} accent="violet" />
        <StatCard label="დასარეკი დღეს / ვადაგადაც." value={`${kpis.todayFollowUps} / ${kpis.overdue}`} href="/followups" accent={kpis.overdue ? "rose" : "amber"} />
        <StatCard label="დაუმუშავებელი" value={stats.funnel[0]?.value ?? 0} href={`/listings?${q}&status=new`} accent="slate" />
        <StatCard label="გაზიარებული აგენტების მიერ" value={kpis.reposted} hint="ჩვენი პროფილიდან დადებული ასლები" href={`/listings?${q}&reposted=1`} accent="violet" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="ახალი განცხადებები დღეების მიხედვით" className="lg:col-span-2" action={<span className="text-xs text-gray-400">საიტების მიხედვით</span>}>
          <StackedBars data={stats.perDay} keys={stats.siteNames} colors={SITE_COLORS} />
        </Card>
        <Card title="გარიგების ტიპი">
          <Donut data={stats.byDeal} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="რაიონები">
          <HBars data={stats.byDistrict} />
        </Card>
        <Card title="უბნები (ტოპ 15)">
          <HBars data={stats.byNeighbourhood} color="#2563EB" />
        </Card>
        <div className="space-y-4">
          <Card title="ქონების ტიპი">
            <HBars data={stats.byType} color="#D97706" height={180} />
          </Card>
          <Card title="ოთახები">
            <HBars data={stats.byRooms} color="#7C3AED" height={180} />
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="მედიანური $/მ² რაიონებით" action={<span className="text-xs text-gray-400">იყიდება ბინა</span>}>
          <HBars data={stats.medianPpm} color="#0891B2" unit=" $/მ²" />
        </Card>
        <Card title="მედიანური ფასი ოთახების მიხედვით" action={<span className="text-xs text-gray-400">იყიდება ბინა</span>}>
          <HBars data={stats.medianPriceByRooms} color="#65A30D" height={200} unit=" $" />
        </Card>
        <Card title="ლიდების ფანელი">
          <HBars data={stats.funnel} color="#DB2777" />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="აგენტების აქტივობა" action={<span className="text-xs text-gray-400">7 დღე</span>} className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="py-1">აგენტი</th>
                <th className="py-1 text-right">ზარი</th>
                <th className="py-1 text-right">ჩანაწერი</th>
                <th className="py-1 text-right">სტატუსი</th>
                <th className="py-1 text-right">ლიდი</th>
              </tr>
            </thead>
            <tbody>
              {stats.agents.map((agent) => (
                <tr key={agent.name} className="border-t border-gray-100">
                  <td className="py-1.5 font-medium text-gray-800">{agent.name}</td>
                  <td className="py-1.5 text-right tabular-nums">{agent.calls}</td>
                  <td className="py-1.5 text-right tabular-nums">{agent.notes}</td>
                  <td className="py-1.5 text-right tabular-nums">{agent.statusChanges}</td>
                  <td className="py-1.5 text-right tabular-nums">{agent.assigned}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="ვადაგადაცილებული დასარეკი" action={<Link href="/followups" className="text-xs text-emerald-700 hover:underline">ყველა →</Link>}>
          {stats.overdueFollowUps.length === 0 ? (
            <EmptyState title="ვადაგადაცილებული არ არის" />
          ) : (
            <ul className="space-y-2 text-sm">
              {stats.overdueFollowUps.map((lead) => (
                <li key={lead.id} className="flex items-center justify-between gap-2">
                  <Link href={`/listings/${lead.listingId}`} className="truncate font-medium text-gray-800 hover:text-emerald-700">
                    {lead.listing.title ?? lead.listingId}
                  </Link>
                  <span className="shrink-0 text-xs text-rose-600">
                    {fmtDate(lead.followUpAt)} · {lead.assignedTo?.name ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="ბოლო განცხადებები" action={<Link href="/listings" className="text-xs text-emerald-700 hover:underline">ყველა →</Link>}>
          <ul className="divide-y divide-gray-100 text-sm">
            {stats.latest.map((listing) => (
              <li key={listing.id} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <Link href={`/listings/${listing.id}`} className="block truncate font-medium text-gray-800 hover:text-emerald-700">
                    {listing.title ?? listing.propertyId}
                  </Link>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                    <SiteBadge site={listing.site} name={listing.siteName} />
                    <span>{listing.neighbourhood ?? listing.district ?? ""}</span>
                    <span className="font-medium text-gray-700">{fmtMoney(listing.priceUsd)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={listing.lead?.status} />
                  {listing.phone ? <PhoneButton phone={listing.phone} label="📞" /> : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
