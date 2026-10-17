import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { daysAgo, endOfToday, fmtDate, fmtMoney } from "@/lib/format";
import { Button, Card, Chip, EmptyState, Input, PageHeader, PhoneButton, Select } from "@/components/ui";
import { createViewing, deleteViewing, setViewingStatus } from "./actions";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  planned: { label: "დაგეგმილი", cls: "bg-sky-100 text-sky-800" },
  done: { label: "ჩატარდა", cls: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "გაუქმდა", cls: "bg-gray-200 text-gray-600" },
  no_show: { label: "არ მოვიდა", cls: "bg-rose-100 text-rose-800" },
};

function conflicts<T extends { agentId: string; scheduledAt: Date; id: string; status: string }>(items: T[]): Set<string> {
  const flagged = new Set<string>();
  const active = items.filter((v) => v.status === "planned");
  for (const a of active) {
    for (const b of active) {
      if (a.id !== b.id && a.agentId === b.agentId && Math.abs(a.scheduledAt.getTime() - b.scheduledAt.getTime()) < 60 * 60 * 1000) flagged.add(a.id);
    }
  }
  return flagged;
}

export default async function ViewingsPage({ searchParams }: { searchParams: Promise<{ who?: string; range?: string }> }) {
  const me = await requireUser();
  const { who = "", range = "week" } = await searchParams;
  const from = daysAgo(range === "all" ? 365 : 0);
  const to = new Date();
  to.setDate(to.getDate() + (range === "today" ? 0 : range === "week" ? 7 : 365));
  to.setHours(23, 59, 59, 999);
  const [viewings, users, clients] = await Promise.all([
    prisma.viewing.findMany({
      where: { scheduledAt: { gte: from, lte: to }, ...(who === "me" ? { agentId: me.id } : {}) },
      include: { listing: { select: { id: true, title: true, address: true, neighbourhood: true, priceUsd: true, phone: true, lead: { select: { manualPhone: true } } } }, client: { select: { id: true, name: true, phone: true } }, agent: { select: { id: true, name: true } } },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.client.findMany({ where: { status: { notIn: ["closed_won", "closed_lost"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const flagged = conflicts(viewings);
  const eod = endOfToday();
  const groups = [
    { title: "დღეს", items: viewings.filter((v) => v.scheduledAt <= eod && v.scheduledAt >= daysAgo(0)) },
    { title: "მომავალი", items: viewings.filter((v) => v.scheduledAt > eod) },
    { title: "წარსული", items: viewings.filter((v) => v.scheduledAt < daysAgo(0)) },
  ].filter((g) => g.items.length);

  return (
    <div className="space-y-4">
      <PageHeader
        title="დათვალიერებები"
        subtitle="დაგეგმილი ჩვენებები აგენტების მიხედვით; ერთი აგენტის ორი ჩვენება ერთ საათში — გაფრთხილება"
        actions={
          <>
            <Chip href={`/viewings?range=today&who=${who}`} active={range === "today"}>დღეს</Chip>
            <Chip href={`/viewings?range=week&who=${who}`} active={range === "week"}>კვირა</Chip>
            <Chip href={`/viewings?range=all&who=${who}`} active={range === "all"}>ყველა</Chip>
            <span className="mx-1 text-gray-300">|</span>
            <Chip href={`/viewings?range=${range}`} active={who !== "me"}>ყველა აგენტი</Chip>
            <Chip href={`/viewings?range=${range}&who=me`} active={who === "me"}>ჩემი</Chip>
          </>
        }
      />

      <Card title="ახალი დათვალიერება">
        <form action={createViewing} className="grid gap-2 md:grid-cols-6">
          <Input name="scheduledAt" type="datetime-local" required />
          <Select name="clientId" defaultValue="">
            <option value="">კლიენტი (არასავალდებულო)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Input name="listingId" placeholder="განცხადების ID, მაგ. myhome:123" />
          <Input name="address" placeholder="მისამართი" />
          <Select name="agentId" defaultValue={me.id}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
          <Button type="submit">დაგეგმვა</Button>
        </form>
        <p className="mt-1 text-xs text-gray-400">განცხადების ან კლიენტის გვერდიდან დაგეგმვა უფრო მოსახერხებელია — იქ ID ავტომატურად ივსება.</p>
      </Card>

      {groups.length === 0 ? (
        <Card><EmptyState title="დათვალიერებები არ არის" /></Card>
      ) : (
        groups.map((group) => (
          <Card key={group.title} title={group.title} action={<span className="text-xs text-gray-400">{group.items.length}</span>}>
            <ul className="divide-y divide-gray-100">
              {group.items.map((v) => {
                const st = STATUS[v.status] ?? STATUS.planned;
                return (
                  <li key={v.id} className={`flex flex-col gap-2 py-3 md:flex-row md:items-center ${flagged.has(v.id) ? "rounded-lg bg-rose-50/60 px-2" : ""}`}>
                    <div className="w-full md:w-44">
                      <div className="text-sm font-semibold tabular-nums text-gray-900">{fmtDate(v.scheduledAt, true)}</div>
                      <div className="text-xs text-gray-500">{v.agent.name}{flagged.has(v.id) ? " · ⚠ გადაფარვა" : ""}</div>
                    </div>
                    <div className="min-w-0 flex-1 text-sm">
                      {v.listing ? (
                        <Link href={`/listings/${v.listing.id}`} className="block truncate font-medium text-gray-900 hover:text-emerald-700">{v.listing.title ?? v.listing.id}</Link>
                      ) : null}
                      <div className="truncate text-xs text-gray-500">
                        {v.address ?? v.listing?.address ?? ""}{v.listing?.neighbourhood ? ` · ${v.listing.neighbourhood}` : ""}{v.listing?.priceUsd ? ` · ${fmtMoney(v.listing.priceUsd)}` : ""}
                      </div>
                      {v.client ? (
                        <div className="text-xs text-gray-600">
                          კლიენტი: <Link href={`/clients/${v.client.id}`} className="hover:underline">{v.client.name}</Link>
                        </div>
                      ) : null}
                      {v.note ? <div className="text-xs text-gray-500">{v.note}</div> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                      {v.client?.phone ? <PhoneButton phone={v.client.phone} /> : null}
                      {v.listing ? <PhoneButton phone={v.listing.phone || v.listing.lead?.manualPhone} /> : null}
                      {v.status === "planned" ? (
                        <>
                          <form action={setViewingStatus}><input type="hidden" name="id" value={v.id} /><input type="hidden" name="status" value="done" /><Button size="sm" variant="secondary" type="submit">ჩატარდა</Button></form>
                          <form action={setViewingStatus}><input type="hidden" name="id" value={v.id} /><input type="hidden" name="status" value="no_show" /><Button size="sm" variant="secondary" type="submit">არ მოვიდა</Button></form>
                          <form action={setViewingStatus}><input type="hidden" name="id" value={v.id} /><input type="hidden" name="status" value="cancelled" /><Button size="sm" variant="ghost" type="submit">გაუქმება</Button></form>
                        </>
                      ) : (
                        <form action={deleteViewing}><input type="hidden" name="id" value={v.id} /><Button size="sm" variant="ghost" type="submit">წაშლა</Button></form>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
