import Link from "next/link";
import { prisma } from "@/lib/db";
import { isPartner, requireMember } from "@/lib/auth";
import { daysAgo, endOfToday, fmtDate, fmtMoney } from "@/lib/format";
import { Button, Card, Chip, EmptyState, Input, PageHeader, PhoneButton, Select } from "@/components/ui";
import { createViewing, deleteViewing, setViewingStatus } from "./actions";
import { Tx, VIEWING_STATUS_EN, tx } from "@/lib/partnerText";

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
  const me = await requireMember();
  // A partner sees only his own viewings and clients, and never our listings or owners' numbers.
  const partner = isPartner(me);
  const { range = "week" } = await searchParams;
  const who = partner ? "me" : (await searchParams).who ?? "";
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
    prisma.user.findMany({ where: partner ? { id: me.id } : { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.client.findMany({ where: { status: { notIn: ["closed_won", "closed_lost"] }, ...(partner ? { segment: me.segment ?? "indian" } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const flagged = conflicts(viewings);
  const eod = endOfToday();
  const groups = [
    { title: tx(partner, "დღეს", "Today"), hi: "आज", items: viewings.filter((v) => v.scheduledAt <= eod && v.scheduledAt >= daysAgo(0)) },
    { title: tx(partner, "მომავალი", "Upcoming"), hi: "आने वाले", items: viewings.filter((v) => v.scheduledAt > eod) },
    { title: tx(partner, "წარსული", "Past"), hi: "पिछले", items: viewings.filter((v) => v.scheduledAt < daysAgo(0)) },
  ].filter((g) => g.items.length);

  return (
    <div className="space-y-4">
      <PageHeader
        title={<Tx p={partner} ka="დათვალიერებები" en="My viewings" hi="मेरी विज़िट" />}
        subtitle={tx(partner, "დაგეგმილი ჩვენებები აგენტების მიხედვით; ერთი აგენტის ორი ჩვენება ერთ საათში — გაფრთხილება", "Flat viewings with your clients. Two viewings within one hour are flagged.")}
        actions={
          <>
            <Chip href={`/viewings?range=today&who=${who}`} active={range === "today"}>{tx(partner, "დღეს", "Today")}</Chip>
            <Chip href={`/viewings?range=week&who=${who}`} active={range === "week"}>{tx(partner, "კვირა", "Week")}</Chip>
            <Chip href={`/viewings?range=all&who=${who}`} active={range === "all"}>{tx(partner, "ყველა", "All")}</Chip>
            {!partner ? (
              <>
                <span className="mx-1 text-gray-300">|</span>
                <Chip href={`/viewings?range=${range}`} active={who !== "me"}>ყველა აგენტი</Chip>
                <Chip href={`/viewings?range=${range}&who=me`} active={who === "me"}>ჩემი</Chip>
              </>
            ) : null}
          </>
        }
      />

      <Card title={<Tx p={partner} ka="ახალი დათვალიერება" en="New viewing" hi="नई विज़िट" />}>
        <form action={createViewing} className="grid gap-2 md:grid-cols-6">
          <Input name="scheduledAt" type="datetime-local" required />
          <Select name="clientId" defaultValue="">
            <option value="">{tx(partner, "კლიენტი (არასავალდებულო)", "Client")}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          {!partner ? <Input name="listingId" placeholder="განცხადების ID, მაგ. myhome:123" /> : null}
          <Input name="address" placeholder={tx(partner, "მისამართი", "Address")} />
          <Select name="agentId" defaultValue={me.id}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
          <Button type="submit">{tx(partner, "დაგეგმვა", "Plan")}</Button>
        </form>
        <p className="mt-1 text-xs text-gray-400">{tx(partner, "განცხადების ან კლიენტის გვერდიდან დაგეგმვა უფრო მოსახერხებელია — იქ ID ავტომატურად ივსება.", "You can also plan a viewing from the client’s page.")}</p>
      </Card>

      {groups.length === 0 ? (
        <Card><EmptyState title={tx(partner, "დათვალიერებები არ არის", "No viewings")} /></Card>
      ) : (
        groups.map((group) => (
          <Card key={group.title} title={<Tx p={partner} ka={group.title} en={group.title} hi={group.hi} />} action={<span className="text-xs text-gray-400">{group.items.length}</span>}>
            <ul className="divide-y divide-gray-100">
              {group.items.map((v) => {
                const st = STATUS[v.status] ?? STATUS.planned;
                return (
                  <li key={v.id} className={`flex flex-col gap-2 py-3 md:flex-row md:items-center ${flagged.has(v.id) ? "rounded-lg bg-rose-50/60 px-2" : ""}`}>
                    <div className="w-full md:w-44">
                      <div className="text-sm font-semibold tabular-nums text-gray-900">{fmtDate(v.scheduledAt, true)}</div>
                      <div className="text-xs text-gray-500">{v.agent.name}{flagged.has(v.id) ? tx(partner, " · ⚠ გადაფარვა", " · ⚠ overlap") : ""}</div>
                    </div>
                    <div className="min-w-0 flex-1 text-sm">
                      {v.listing && !partner ? (
                        <Link href={`/listings/${v.listing.id}`} className="block truncate font-medium text-gray-900 hover:text-emerald-700">{v.listing.title ?? v.listing.id}</Link>
                      ) : null}
                      <div className="truncate text-xs text-gray-500">
                        {partner ? v.address ?? "" : <>{v.address ?? v.listing?.address ?? ""}{v.listing?.neighbourhood ? ` · ${v.listing.neighbourhood}` : ""}{v.listing?.priceUsd ? ` · ${fmtMoney(v.listing.priceUsd)}` : ""}</>}
                      </div>
                      {v.client ? (
                        <div className="text-xs text-gray-600">
                          {tx(partner, "კლიენტი", "Client")}: <Link href={`/clients/${v.client.id}`} className="hover:underline">{v.client.name}</Link>
                        </div>
                      ) : null}
                      {v.note ? <div className="text-xs text-gray-500">{v.note}</div> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{partner ? VIEWING_STATUS_EN[v.status] ?? st.label : st.label}</span>
                      {v.client?.phone ? <PhoneButton phone={v.client.phone} /> : null}
                      {v.listing && !partner ? <PhoneButton phone={v.listing.phone || v.listing.lead?.manualPhone} /> : null}
                      {v.status === "planned" ? (
                        <>
                          <form action={setViewingStatus}><input type="hidden" name="id" value={v.id} /><input type="hidden" name="status" value="done" /><Button size="sm" variant="secondary" type="submit">{tx(partner, "ჩატარდა", "Done")}</Button></form>
                          <form action={setViewingStatus}><input type="hidden" name="id" value={v.id} /><input type="hidden" name="status" value="no_show" /><Button size="sm" variant="secondary" type="submit">{tx(partner, "არ მოვიდა", "No-show")}</Button></form>
                          <form action={setViewingStatus}><input type="hidden" name="id" value={v.id} /><input type="hidden" name="status" value="cancelled" /><Button size="sm" variant="ghost" type="submit">{tx(partner, "გაუქმება", "Cancel")}</Button></form>
                        </>
                      ) : (
                        <form action={deleteViewing}><input type="hidden" name="id" value={v.id} /><Button size="sm" variant="ghost" type="submit">{tx(partner, "წაშლა", "Delete")}</Button></form>
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
