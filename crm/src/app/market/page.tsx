import { requireUser } from "@/lib/auth";
import { areaStats } from "@/lib/market";
import { fmtMoney, fmtNum } from "@/lib/format";
import { Card, Chip, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function MarketPage({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  await requireUser();
  const { level = "neighbourhood" } = await searchParams;
  const rows = await areaStats(level === "district" ? "district" : "neighbourhood");

  return (
    <div className="space-y-4">
      <PageHeader
        title="ბაზარი"
        subtitle="ბინები, ბოლო 90 დღე: მედიანური ფასი მ²-ზე (იყიდება), მედიანური ქირა, მესაკუთრის ახალი პოსტები, საშუალო დრო ბაზარზე"
        actions={
          <>
            <Chip href="/market" active={level !== "district"}>უბნები</Chip>
            <Chip href="/market?level=district" active={level === "district"}>რაიონები</Chip>
          </>
        }
      />
      <Card className="overflow-x-auto">
        {rows.length === 0 ? (
          <EmptyState title="მონაცემები ჯერ არ არის" />
        ) : (
          <table className="ui-table w-full min-w-[820px] text-sm">
            <thead>
              <tr>
                <th>{level === "district" ? "რაიონი" : "უბანი"}</th>
                <th className="text-right">აქტიური</th>
                <th className="text-right">იყიდება $/მ² (მედ.)</th>
                <th className="text-right">ნიმუში</th>
                <th className="text-right">ქირა $/თვე (მედ.)</th>
                <th className="text-right">ნიმუში</th>
                <th className="text-right">მესაკუთრე 7 დღე</th>
                <th className="text-right">მესაკუთრე 30 დღე</th>
                <th className="text-right">დღე ბაზარზე</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name}>
                  <td>
                    <div className="font-medium text-gray-900">{row.name}</div>
                    {level !== "district" && row.district ? <div className="text-xs text-gray-500">{row.district}</div> : null}
                  </td>
                  <td className="text-right tabular-nums">{row.active}</td>
                  <td className="text-right font-semibold tabular-nums">{row.saleMedianPpm ? fmtNum(row.saleMedianPpm) : "—"}</td>
                  <td className="text-right text-xs text-gray-500">{row.saleCount}</td>
                  <td className="text-right font-semibold tabular-nums">{row.rentMedian ? fmtMoney(row.rentMedian) : "—"}</td>
                  <td className="text-right text-xs text-gray-500">{row.rentCount}</td>
                  <td className="text-right tabular-nums">{row.ownerNew7}</td>
                  <td className="text-right tabular-nums">{row.ownerNew30}</td>
                  <td className="text-right tabular-nums">{row.avgDaysOnMarket ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-gray-400">მედიანა = შუა მნიშვნელობა; ნიმუში 5-ზე ნაკლები — ნუ დაეყრდნობი. „დღე ბაზარზე“ = განთავსებიდან დღემდე (ან საიტიდან გაქრობამდე).</p>
      </Card>
    </div>
  );
}
