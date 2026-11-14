import Link from "next/link";
import { prisma } from "@/lib/db";
import { isPartner, requireMember } from "@/lib/auth";
import { fmtDate, fmtMoney } from "@/lib/format";
import { CLIENT_SEGMENTS, CLIENT_STATUS, CLIENT_STATUSES } from "@/lib/clients";
import { Button, Card, Chip, EmptyState, Input, PageHeader, PhoneButton, Select } from "@/components/ui";
import { createClient } from "./actions";
import { CLIENT_STATUS_EN, DEAL_EN, SEGMENT_EN, Tx, tx } from "@/lib/partnerText";

export const dynamic = "force-dynamic";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ status?: string; segment?: string }> }) {
  const me = await requireMember();
  // A partner sees only his own clients (never another partner's), and only himself to assign.
  const partner = isPartner(me);
  const { status = "" } = await searchParams;
  const segment = partner ? me.segment ?? "indian" : (await searchParams).segment ?? "";
  const [clients, users] = await Promise.all([
    prisma.client.findMany({
      where: { ...(status ? { status } : {}), ...(partner ? { assignedToId: me.id } : segment ? { segment } : {}) },
      include: { assignedTo: { select: { name: true } }, _count: { select: { shortlists: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.user.findMany({ where: partner ? { id: me.id } : { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const href = (extra: Record<string, string>) => {
    const params = new URLSearchParams({ status, segment, ...extra });
    for (const [k, v] of Array.from(params.entries())) if (!v) params.delete(k);
    const text = params.toString();
    return `/clients${text ? `?${text}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={<><Tx p={partner} ka="კლიენტები" en="My clients" hi="मेरे ग्राहक" /> <span className="text-base font-normal text-gray-400">{clients.length}</span></>}
        subtitle={tx(partner, "მდგმურები და მყიდველები, რომლებსაც ჩვენ ვემსახურებით (ტურისტები, ექსპატები, ინდოელი თემი...)", "People looking for a flat. Write everything in English.")}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Chip href={href({ status: "" })} active={!status}>{tx(partner, "ყველა სტატუსი", "All")}</Chip>
        {CLIENT_STATUSES.map((s) => (
          <Chip key={s.value} href={href({ status: s.value })} active={status === s.value}>{partner ? CLIENT_STATUS_EN[s.value] : s.label}</Chip>
        ))}
        {!partner ? (
          <>
            <span className="mx-1 text-gray-300">|</span>
            <Chip href={href({ segment: "" })} active={!segment}>ყველა სეგმენტი</Chip>
            {CLIENT_SEGMENTS.map((s) => (
              <Chip key={s.value} href={href({ segment: s.value })} active={segment === s.value}>{s.label}</Chip>
            ))}
          </>
        ) : null}
      </div>

      <Card title={<Tx p={partner} ka="ახალი კლიენტი" en="New client" hi="नया ग्राहक" />}>
        <form action={createClient} className="grid gap-2 md:grid-cols-4 xl:grid-cols-6">
          <Input name="name" required placeholder={tx(partner, "სახელი *", "Name *")} />
          <Input name="phone" placeholder={tx(partner, "ტელეფონი", "Phone")} />
          <Input name="messenger" placeholder="WhatsApp / Telegram" />
          <Input name="nationality" placeholder={tx(partner, "ეროვნება", "Nationality")} />
          <Select name="segment" defaultValue={partner ? segment : ""} disabled={partner}>
            <option value="">{tx(partner, "სეგმენტი", "Segment")}</option>
            {CLIENT_SEGMENTS.map((s) => (
              <option key={s.value} value={s.value}>{partner ? SEGMENT_EN[s.value] : s.label}</option>
            ))}
          </Select>
          <Select name="dealType" defaultValue="ქირავდება">
            <option value="ქირავდება">{tx(partner, "ქირავდება", "Rent")}</option>
            <option value="ქირავდება დღიურად">{tx(partner, "ქირავდება დღიურად", "Daily rent")}</option>
            <option value="იყიდება">{tx(partner, "იყიდება", "Sale")}</option>
          </Select>
          <Input name="budgetMin" placeholder={tx(partner, "ბიუჯეტი $ დან", "Budget from $")} inputMode="numeric" />
          <Input name="budgetMax" placeholder={tx(partner, "ბიუჯეტი $ მდე", "Budget to $")} inputMode="numeric" />
          <Input name="roomsMin" placeholder={tx(partner, "ოთახი (მინ.)", "Rooms (min)")} inputMode="numeric" />
          <Input name="areas" placeholder={tx(partner, "უბნები: ვაკე, საბურთალო", "Areas: Vake, Saburtalo")} className="md:col-span-2" />
          <Input name="moveIn" type="date" title={tx(partner, "შესვლის თარიღი", "Move-in date")} />
          <Input name="durationMonths" placeholder={tx(partner, "ვადა, თვე", "Months")} inputMode="numeric" />
          <Input name="occupants" placeholder={tx(partner, "რამდენი იცხოვრებს", "People living")} inputMode="numeric" />
          <Select name="pets" defaultValue="">
            <option value="">{tx(partner, "შინაური ცხოველი?", "Pets?")}</option>
            <option value="yes">{tx(partner, "კი", "Yes, has pets")}</option>
            <option value="no">{tx(partner, "არა", "No pets")}</option>
          </Select>
          <Input name="interests" placeholder={tx(partner, "სურვილები: ავეჯი, აივანი, მეტროსთან…", "Wishes: furnished, balcony, near metro, work place…")} className="md:col-span-2 xl:col-span-3" />
          <Select name="assignedToId" defaultValue={me.id}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
          <Input name="notes" placeholder={tx(partner, "შენიშვნა", "Notes")} className="md:col-span-3 xl:col-span-3" />
          <Button type="submit">{tx(partner, "დამატება", "Add")}</Button>
        </form>
      </Card>

      {clients.length === 0 ? (
        <Card><EmptyState title={tx(partner, "კლიენტები ჯერ არ არის", "No clients yet")} hint={tx(partner, "დაამატეთ პირველი კლიენტი ზემოთ", "Add your first client above")} /></Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {clients.map((client) => {
            const st = CLIENT_STATUS[client.status] ?? CLIENT_STATUS.new;
            return (
              <li key={client.id} className="ui-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/clients/${client.id}`} className="block truncate text-base font-semibold text-gray-900 hover:text-emerald-700">
                      {client.name}
                    </Link>
                    <div className="text-xs text-gray-500">
                      {[client.nationality, partner ? SEGMENT_EN[client.segment ?? ""] : CLIENT_SEGMENTS.find((s) => s.value === client.segment)?.label, client.assignedTo?.name].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${st.color}`}>{partner ? CLIENT_STATUS_EN[client.status] ?? st.label : st.label}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-700">
                  <span>{(partner ? DEAL_EN[client.dealType ?? ""] : null) ?? client.dealType ?? "—"}</span>
                  {client.budgetMin || client.budgetMax ? <span>{fmtMoney(client.budgetMin) || "$0"} – {fmtMoney(client.budgetMax) || "∞"}</span> : null}
                  {client.roomsMin ? <span>{client.roomsMin}+ {tx(partner, "ოთ.", "rooms")}</span> : null}
                  {client.areas ? <span className="truncate">{client.areas}</span> : null}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {partner ? (client.moveIn ? `Move-in ${fmtDate(client.moveIn)}` : `Updated ${fmtDate(client.updatedAt)}`) : <>{client._count.shortlists} შერჩეული · {client.moveIn ? `შესვლა ${fmtDate(client.moveIn)}` : fmtDate(client.updatedAt)}</>}
                  </span>
                  {partner && !client.phone ? null : <PhoneButton phone={client.phone} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
