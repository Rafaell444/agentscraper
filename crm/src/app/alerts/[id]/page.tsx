import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { filterOptions } from "@/lib/queries";
import { ruleWhere } from "@/lib/alerts";
import { daysAgo, fmtDate, fmtMoney } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";
import { RuleForm } from "../RuleForm";

export const dynamic = "force-dynamic";

export default async function EditAlertPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [rule, recipients, options] = await Promise.all([
    prisma.alertRule.findUnique({ where: { id } }),
    prisma.telegramRecipient.findMany({ orderBy: { createdAt: "asc" } }),
    filterOptions(""),
  ]);
  if (!rule) notFound();
  // What this rule would have sent in the last 7 days, to check the filters.
  const recent = await prisma.listing.findMany({
    where: { AND: [ruleWhere(rule), { collectedAt: { gte: daysAgo(7) } }] },
    orderBy: { collectedAt: "desc" },
    take: 15,
    select: { id: true, title: true, siteName: true, priceUsd: true, neighbourhood: true, district: true, collectedAt: true },
  });

  return (
    <div className="space-y-4">
      <PageHeader title={rule.name} actions={<Link href="/alerts" className="ui-btn ui-btn-ghost ui-btn-sm">← ყველა ფილტრი</Link>} />
      <Card title="ფილტრის შეცვლა">
        <RuleForm rule={rule} options={options} recipients={recipients} />
      </Card>
      <Card title={`ბოლო 7 დღეში ამ ფილტრს დაემთხვეოდა (${recent.length}${recent.length === 15 ? "+" : ""})`}>
        {recent.length ? (
          <ul className="divide-y divide-gray-100 text-sm">
            {recent.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 py-1.5">
                <Link href={`/listings/${encodeURIComponent(l.id)}`} className="min-w-0 flex-1 truncate text-gray-900 hover:text-emerald-700">{l.title ?? l.id}</Link>
                <span className="text-xs text-gray-500">{l.siteName} · {l.neighbourhood ?? l.district} · {fmtMoney(l.priceUsd)} · {fmtDate(l.collectedAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">ბოლო კვირაში ასეთი განცხადება არ ყოფილა — შეიძლება ფილტრი ზედმეტად ვიწროა.</p>
        )}
      </Card>
    </div>
  );
}
