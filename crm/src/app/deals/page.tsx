import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Button, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { createDeal, deleteDeal } from "./actions";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { sale: "გაყიდვა", rent: "გაქირავება", daily: "დღიური" };

function monthKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tbilisi", year: "numeric", month: "2-digit" }).format(date);
}

export default async function DealsPage() {
  const me = await requireUser();
  const [deals, users, clients] = await Promise.all([
    prisma.deal.findMany({
      include: { agent: { select: { id: true, name: true } }, client: { select: { id: true, name: true } }, listing: { select: { id: true, title: true } } },
      orderBy: { closedAt: "desc" },
      take: 300,
    }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 300 }),
  ]);

  // Monthly report per agent.
  const months = new Map<string, Map<string, { deals: number; commission: number; amount: number }>>();
  for (const deal of deals) {
    const m = monthKey(deal.closedAt);
    const byAgent = months.get(m) ?? months.set(m, new Map()).get(m)!;
    const row = byAgent.get(deal.agent.name) ?? byAgent.set(deal.agent.name, { deals: 0, commission: 0, amount: 0 }).get(deal.agent.name)!;
    row.deals += 1;
    row.commission += deal.commission ?? 0;
    row.amount += deal.amount ?? 0;
  }
  const thisMonth = monthKey(new Date());
  const totalThisMonth = Array.from(months.get(thisMonth)?.values() ?? []).reduce((s, r) => s + r.commission, 0);

  return (
    <div className="space-y-4">
      <PageHeader title="გარიგებები" subtitle={`ამ თვის საკომისიო: ${fmtMoney(totalThisMonth)} · ${months.get(thisMonth) ? Array.from(months.get(thisMonth)!.values()).reduce((s, r) => s + r.deals, 0) : 0} გარიგება`} />

      <Card title="ახალი გარიგება">
        <form action={createDeal} className="grid gap-2 md:grid-cols-4 xl:grid-cols-8">
          <Select name="kind" defaultValue="rent">
            {Object.entries(KIND).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
          <Input name="amount" placeholder="თანხა $ (ფასი/ქირა)" inputMode="numeric" required />
          <Input name="commissionPct" placeholder="საკომისიო %" inputMode="numeric" />
          <Input name="commission" placeholder="ან საკომისიო $" inputMode="numeric" />
          <Input name="closedAt" type="date" />
          <Select name="agentId" defaultValue={me.id}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
          <Select name="clientId" defaultValue="">
            <option value="">კლიენტი</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Input name="listingId" placeholder="განცხადების ID" />
          <Input name="note" placeholder="შენიშვნა" className="md:col-span-3 xl:col-span-7" />
          <Button type="submit">დამატება</Button>
        </form>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="თვიური ანგარიში (საკომისიო აგენტების მიხედვით)" className="lg:col-span-1">
          {months.size === 0 ? (
            <EmptyState title="გარიგებები ჯერ არ არის" />
          ) : (
            <div className="space-y-3">
              {Array.from(months.entries()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6).map(([m, byAgent]) => (
                <div key={m}>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{m}</div>
                  <table className="w-full text-sm">
                    <tbody>
                      {Array.from(byAgent.entries()).sort((a, b) => b[1].commission - a[1].commission).map(([name, r]) => (
                        <tr key={name} className="border-t border-gray-100">
                          <td className="py-1">{name}</td>
                          <td className="py-1 text-right tabular-nums text-gray-600">{r.deals}</td>
                          <td className="py-1 text-right font-semibold tabular-nums">{fmtMoney(r.commission)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="ყველა გარიგება" className="lg:col-span-2 overflow-x-auto">
          {deals.length === 0 ? (
            <EmptyState title="გარიგებები ჯერ არ არის" hint="დაამატეთ პირველი ზემოთ ან განცხადების გვერდიდან" />
          ) : (
            <table className="ui-table w-full min-w-[640px] text-sm">
              <thead>
                <tr>
                  <th>თარიღი</th>
                  <th>ტიპი</th>
                  <th>აგენტი</th>
                  <th>კლიენტი / ობიექტი</th>
                  <th className="text-right">თანხა</th>
                  <th className="text-right">საკომისიო</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => (
                  <tr key={d.id}>
                    <td className="whitespace-nowrap">{fmtDate(d.closedAt)}</td>
                    <td>{KIND[d.kind] ?? d.kind}</td>
                    <td>{d.agent.name}</td>
                    <td className="max-w-[280px]">
                      {d.client ? <Link href={`/clients/${d.client.id}`} className="hover:underline">{d.client.name}</Link> : null}
                      {d.client && d.listing ? " · " : ""}
                      {d.listing ? <Link href={`/listings/${d.listing.id}`} className="truncate hover:underline">{d.listing.title ?? d.listing.id}</Link> : null}
                      {d.note ? <div className="text-xs text-gray-500">{d.note}</div> : null}
                    </td>
                    <td className="text-right tabular-nums">{fmtMoney(d.amount)}</td>
                    <td className="text-right font-semibold tabular-nums">{fmtMoney(d.commission)}</td>
                    <td className="text-right">
                      <form action={deleteDeal}><input type="hidden" name="id" value={d.id} /><Button size="sm" variant="ghost" type="submit">×</Button></form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
