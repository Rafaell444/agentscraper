import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtMoney } from "@/lib/format";
import { statusLabel } from "@/lib/options";
import { Card, EmptyState, PageHeader, PhoneButton, Tabs } from "@/components/ui";
import { POSTER_KINDS } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function OwnersPage({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  await requireUser();
  const { who = "owner" } = await searchParams;
  const listings = await prisma.listing.findMany({
    where: {
      archived: false,
      NOT: [{ phone: null }, { phone: "" }],
      ...(who === "owner" || who === "agent" ? { posterKind: who } : {}),
    },
    select: {
      id: true,
      title: true,
      siteName: true,
      phone: true,
      ownerName: true,
      priceUsd: true,
      collectedAt: true,
      lead: { select: { status: true, assignedTo: { select: { name: true } } } },
    },
    orderBy: { collectedAt: "desc" },
  });

  type Group = {
    phone: string;
    names: Set<string>;
    sites: Set<string>;
    listings: typeof listings;
    statuses: Set<string>;
    agents: Set<string>;
    latest: Date | null;
  };
  const groups = new Map<string, Group>();
  for (const listing of listings) {
    const phone = (listing.phone ?? "").split(";")[0].trim();
    if (!phone) continue;
    const group = groups.get(phone) ?? { phone, names: new Set<string>(), sites: new Set<string>(), listings: [], statuses: new Set<string>(), agents: new Set<string>(), latest: null };
    if (listing.ownerName) group.names.add(listing.ownerName);
    group.sites.add(listing.siteName);
    group.listings.push(listing);
    group.statuses.add(statusLabel(listing.lead?.status));
    if (listing.lead?.assignedTo?.name) group.agents.add(listing.lead.assignedTo.name);
    if (listing.collectedAt && (!group.latest || listing.collectedAt > group.latest)) group.latest = listing.collectedAt;
    groups.set(phone, group);
  }
  const rows = Array.from(groups.values()).sort((a, b) => b.listings.length - a.listings.length || (b.latest?.getTime() ?? 0) - (a.latest?.getTime() ?? 0));
  const multi = rows.filter((row) => row.listings.length > 1).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <>
            {who === "agent" ? "აგენტები" : who === "all" ? "განმთავსებლები" : "მესაკუთრეები"} <span className="text-base font-normal text-gray-400">{rows.length}</span>
          </>
        }
        subtitle={`უნიკალური ნომრები · ${multi} განმთავსებელს აქვს ერთზე მეტი განცხადება (რამდენიმე ობიექტი ან ერთი ობიექტი რამდენიმე საიტზე)`}
        actions={<Tabs items={POSTER_KINDS} current={who} hrefFor={(value) => `/owners?who=${value}`} />}
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState title="ტელეფონით განცხადებები ჯერ არ არის" />
        </Card>
      ) : null}

      <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((group) => (
          <li key={group.phone} className="ui-card flex flex-col p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-semibold text-gray-900">{Array.from(group.names).join(", ") || "უცნობი სახელი"}</div>
                <div className="text-xs text-gray-500">
                  {group.listings.length} განცხადება · {Array.from(group.sites).join(", ")} · {fmtDate(group.latest)}
                </div>
              </div>
              <PhoneButton phone={group.phone} />
            </div>
            <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-gray-500">
              {Array.from(group.statuses).map((status) => (
                <span key={status} className="rounded bg-gray-100 px-1.5 py-0.5">
                  {status}
                </span>
              ))}
              {Array.from(group.agents).map((agent) => (
                <span key={agent} className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800">
                  {agent}
                </span>
              ))}
            </div>
            <ul className="mt-2 space-y-1 border-t border-gray-100 pt-2 text-sm">
              {group.listings.slice(0, 4).map((listing) => (
                <li key={listing.id} className="flex items-center justify-between gap-2">
                  <Link href={`/listings/${listing.id}`} className="truncate text-gray-800 hover:text-emerald-700">
                    {listing.title ?? listing.id}
                  </Link>
                  <span className="shrink-0 text-xs font-medium text-gray-600">{fmtMoney(listing.priceUsd)}</span>
                </li>
              ))}
              {group.listings.length > 4 ? (
                <li>
                  <Link href={`/listings?phone=${group.phone}`} className="text-xs text-emerald-700 hover:underline">
                    +{group.listings.length - 4} კიდევ →
                  </Link>
                </li>
              ) : null}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
