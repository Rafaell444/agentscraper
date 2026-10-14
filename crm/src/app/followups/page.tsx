import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { daysAgo, endOfToday, fmtDate, fmtMoney } from "@/lib/format";
import { Card, Chip, EmptyState, PageHeader, PhoneButton, SiteBadge, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function FollowupsPage({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  const user = await requireUser();
  const { who = "" } = await searchParams;
  const leads = await prisma.lead.findMany({
    where: {
      followUpAt: { not: null },
      status: { notIn: ["signed", "rejected", "irrelevant"] },
      ...(who === "me" ? { assignedToId: user.id } : {}),
    },
    include: {
      listing: { select: { id: true, title: true, site: true, siteName: true, phone: true, priceUsd: true, neighbourhood: true, ownerName: true } },
      assignedTo: { select: { id: true, name: true } },
    },
    orderBy: { followUpAt: "asc" },
  });
  const today = daysAgo(0);
  const eod = endOfToday();
  const groups = [
    { title: "ვადაგადაცილებული", items: leads.filter((l) => l.followUpAt! < today), tone: "text-rose-700", ring: "border-l-rose-400" },
    { title: "დღეს", items: leads.filter((l) => l.followUpAt! >= today && l.followUpAt! <= eod), tone: "text-emerald-700", ring: "border-l-emerald-500" },
    { title: "მომავალი", items: leads.filter((l) => l.followUpAt! > eod), tone: "text-gray-700", ring: "border-l-gray-300" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="დასარეკი"
        subtitle="დაგეგმილი ზარები სტატუსის მიხედვით"
        actions={
          <>
            <Chip href="/followups" active={who !== "me"}>
              ყველა აგენტი
            </Chip>
            <Chip href="/followups?who=me" active={who === "me"}>
              მხოლოდ ჩემი
            </Chip>
          </>
        }
      />
      {groups.map((group) => (
        <Card
          key={group.title}
          title={group.title}
          action={<span className={`rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold ${group.tone}`}>{group.items.length}</span>}
        >
          {group.items.length === 0 ? (
            <EmptyState title="არაფერია" />
          ) : (
            <ul className="space-y-2">
              {group.items.map((lead) => (
                <li key={lead.id} className={`flex flex-col gap-2 rounded-xl border border-gray-100 border-l-4 ${group.ring} p-3 sm:flex-row sm:items-center ${lead.assignedToId === user.id ? "bg-emerald-50/30" : ""}`}>
                  <div className="w-full sm:w-40">
                    <div className={`text-sm font-semibold tabular-nums ${group.tone}`}>{fmtDate(lead.followUpAt, true)}</div>
                    <div className="text-xs text-gray-500">{lead.assignedTo?.name ?? "მიუკუთვნებელი"}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={`/listings/${lead.listingId}`} className="block truncate font-medium text-gray-900 hover:text-emerald-700">
                      {lead.listing.title ?? lead.listingId}
                    </Link>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                      <SiteBadge site={lead.listing.site} name={lead.listing.siteName} />
                      <span>{lead.listing.neighbourhood ?? ""}</span>
                      <span className="font-medium text-gray-700">{fmtMoney(lead.listing.priceUsd)}</span>
                      {lead.listing.ownerName ? <span>· {lead.listing.ownerName}</span> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={lead.status} />
                    <PhoneButton phone={lead.listing.phone} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}
