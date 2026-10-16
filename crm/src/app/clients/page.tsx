import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtMoney } from "@/lib/format";
import { CLIENT_SEGMENTS, CLIENT_STATUS, CLIENT_STATUSES } from "@/lib/clients";
import { Button, Card, Chip, EmptyState, Input, PageHeader, PhoneButton, Select } from "@/components/ui";
import { createClient } from "./actions";

export const dynamic = "force-dynamic";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ status?: string; segment?: string }> }) {
  const me = await requireUser();
  const { status = "", segment = "" } = await searchParams;
  const [clients, users] = await Promise.all([
    prisma.client.findMany({
      where: { ...(status ? { status } : {}), ...(segment ? { segment } : {}) },
      include: { assignedTo: { select: { name: true } }, _count: { select: { shortlists: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
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
        title={<>კლიენტები <span className="text-base font-normal text-gray-400">{clients.length}</span></>}
        subtitle="მდგმურები და მყიდველები, რომლებსაც ჩვენ ვემსახურებით (ტურისტები, ექსპატები, ინდოელი თემი...)"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Chip href={href({ status: "" })} active={!status}>ყველა სტატუსი</Chip>
        {CLIENT_STATUSES.map((s) => (
          <Chip key={s.value} href={href({ status: s.value })} active={status === s.value}>{s.label}</Chip>
        ))}
        <span className="mx-1 text-gray-300">|</span>
        <Chip href={href({ segment: "" })} active={!segment}>ყველა სეგმენტი</Chip>
        {CLIENT_SEGMENTS.map((s) => (
          <Chip key={s.value} href={href({ segment: s.value })} active={segment === s.value}>{s.label}</Chip>
        ))}
      </div>

      <Card title="ახალი კლიენტი">
        <form action={createClient} className="grid gap-2 md:grid-cols-4 xl:grid-cols-6">
          <Input name="name" required placeholder="სახელი *" />
          <Input name="phone" placeholder="ტელეფონი" />
          <Input name="messenger" placeholder="WhatsApp / Telegram" />
          <Input name="nationality" placeholder="ეროვნება" />
          <Select name="segment" defaultValue="">
            <option value="">სეგმენტი</option>
            {CLIENT_SEGMENTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
          <Select name="dealType" defaultValue="ქირავდება">
            <option value="ქირავდება">ქირავდება</option>
            <option value="ქირავდება დღიურად">ქირავდება დღიურად</option>
            <option value="იყიდება">იყიდება</option>
          </Select>
          <Input name="budgetMin" placeholder="ბიუჯეტი $ დან" inputMode="numeric" />
          <Input name="budgetMax" placeholder="ბიუჯეტი $ მდე" inputMode="numeric" />
          <Input name="roomsMin" placeholder="ოთახი (მინ.)" inputMode="numeric" />
          <Input name="areas" placeholder="უბნები: ვაკე, საბურთალო" className="md:col-span-2" />
          <Input name="moveIn" type="date" />
          <Input name="durationMonths" placeholder="ვადა, თვე" inputMode="numeric" />
          <Select name="assignedToId" defaultValue={me.id}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
          <Input name="notes" placeholder="შენიშვნა" className="md:col-span-3 xl:col-span-3" />
          <Button type="submit">დამატება</Button>
        </form>
      </Card>

      {clients.length === 0 ? (
        <Card><EmptyState title="კლიენტები ჯერ არ არის" hint="დაამატეთ პირველი კლიენტი ზემოთ" /></Card>
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
                      {[client.nationality, CLIENT_SEGMENTS.find((s) => s.value === client.segment)?.label, client.assignedTo?.name].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${st.color}`}>{st.label}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-700">
                  <span>{client.dealType ?? "—"}</span>
                  {client.budgetMin || client.budgetMax ? <span>{fmtMoney(client.budgetMin) || "$0"} – {fmtMoney(client.budgetMax) || "∞"}</span> : null}
                  {client.roomsMin ? <span>{client.roomsMin}+ ოთ.</span> : null}
                  {client.areas ? <span className="truncate">{client.areas}</span> : null}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {client._count.shortlists} შერჩეული · {client.moveIn ? `შესვლა ${fmtDate(client.moveIn)}` : fmtDate(client.updatedAt)}
                  </span>
                  <PhoneButton phone={client.phone} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
