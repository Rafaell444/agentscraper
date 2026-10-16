import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtMoney, fmtNum, waHref } from "@/lib/format";
import { CLIENT_SEGMENTS, CLIENT_STATUSES, SHORTLIST_STATUSES, splitAreas } from "@/lib/clients";
import { Button, Card, Input, PageHeader, PhoneButton, PosterBadge, Select, SiteBadge } from "@/components/ui";
import { addToShortlist, removeFromShortlist, setClientStatus, updateClient, updateShortlist } from "../actions";

export const dynamic = "force-dynamic";

function toDateInput(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      assignedTo: true,
      shortlists: { include: { listing: { include: { lead: { select: { manualPhone: true } } } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!client) notFound();
  const users = await prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } });

  // Listings matching the client's wishes (newest first), excluding ones already shortlisted.
  const areas = splitAreas(client.areas);
  const where: Prisma.ListingWhereInput = { archived: false, id: { notIn: client.shortlists.map((s) => s.listingId) } };
  if (client.dealType) where.dealType = client.dealType;
  if (client.budgetMin != null || client.budgetMax != null) where.priceUsd = { gte: client.budgetMin ?? undefined, lte: client.budgetMax ?? undefined };
  if (client.roomsMin) where.rooms = { gte: client.roomsMin };
  if (areas.length) where.OR = [{ neighbourhood: { in: areas } }, { district: { in: areas } }];
  const matches = await prisma.listing.findMany({
    where,
    orderBy: { collectedAt: "desc" },
    take: 30,
    include: { lead: { select: { manualPhone: true, status: true } } },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/clients" className="ui-btn ui-btn-ghost ui-btn-sm -ml-2">← კლიენტები</Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <PageHeader
            title={client.name}
            subtitle={[client.nationality, CLIENT_SEGMENTS.find((s) => s.value === client.segment)?.label, client.language].filter(Boolean).join(" · ")}
            actions={
              <>
                <PhoneButton phone={client.phone} size="md" />
                {client.phone || client.messenger ? (
                  <a href={waHref(client.messenger || client.phone)} target="_blank" rel="noreferrer" className="ui-btn ui-btn-secondary">WhatsApp</a>
                ) : null}
              </>
            }
          />

          <Card title="სტატუსი">
            <div className="flex flex-wrap gap-1.5">
              {CLIENT_STATUSES.map((s) => (
                <form key={s.value} action={setClientStatus}>
                  <input type="hidden" name="id" value={client.id} />
                  <input type="hidden" name="status" value={s.value} />
                  <button type="submit" className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${client.status === s.value ? `${s.color} border-transparent ring-2 ring-emerald-500/30` : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
                    {s.label}
                  </button>
                </form>
              ))}
            </div>
          </Card>

          <Card title={`შესაფერისი განცხადებები (${matches.length})`} action={<span className="text-xs text-gray-400">{client.dealType ?? "ყველა"} · {areas.join(", ") || "ყველა უბანი"}</span>}>
            {matches.length === 0 ? (
              <p className="text-sm text-gray-400">ვერაფერი მოიძებნა — შეამსუბუქეთ მოთხოვნები (ბიუჯეტი, უბნები).</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {matches.map((listing) => (
                  <li key={listing.id} className="flex items-center gap-2 py-2 sm:gap-3">
                    {listing.image ? <img src={listing.image} alt="" className="hidden h-14 w-20 shrink-0 rounded-md object-cover sm:block" /> : <div className="hidden h-14 w-20 shrink-0 rounded-md bg-gray-100 sm:block" />}
                    <div className="min-w-0 flex-1">
                      <Link href={`/listings/${listing.id}`} className="block truncate text-sm font-medium text-gray-900 hover:text-emerald-700">
                        {listing.title ?? listing.propertyId}
                      </Link>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                        <SiteBadge site={listing.site} name={listing.siteName} />
                        <PosterBadge kind={listing.posterKind} ownerType={listing.ownerType} />
                        <span>{listing.neighbourhood ?? listing.district}</span>
                        <span>{listing.rooms ? `${listing.rooms} ოთ.` : ""} {listing.areaM2 ? `${fmtNum(listing.areaM2)} მ²` : ""}</span>
                        <span className="font-semibold text-gray-800">{fmtMoney(listing.priceUsd)}</span>
                        <span>{fmtDate(listing.collectedAt)}</span>
                      </div>
                    </div>
                    <form action={addToShortlist}>
                      <input type="hidden" name="clientId" value={client.id} />
                      <input type="hidden" name="listingId" value={listing.id} />
                      <Button size="sm" variant="secondary" type="submit">+ შერჩევა</Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`შერჩეული (${client.shortlists.length})`}>
            {client.shortlists.length === 0 ? (
              <p className="text-sm text-gray-400">ჯერ არაფერია შერჩეული</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {client.shortlists.map((item) => (
                  <li key={item.id} className="space-y-2 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <Link href={`/listings/${item.listingId}`} className="block truncate text-sm font-medium text-gray-900 hover:text-emerald-700">
                          {item.listing.title ?? item.listingId}
                        </Link>
                        <div className="text-xs text-gray-500">
                          {item.listing.neighbourhood ?? item.listing.district} · {fmtMoney(item.listing.priceUsd)} · {item.listing.rooms ? `${item.listing.rooms} ოთ.` : ""}
                        </div>
                      </div>
                      <PhoneButton phone={item.listing.phone || item.listing.lead?.manualPhone} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <form action={updateShortlist} className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="clientId" value={client.id} />
                        <Select name="status" defaultValue={item.status} className="w-full sm:w-44">
                          {SHORTLIST_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </Select>
                        <Input name="note" defaultValue={item.note ?? ""} placeholder="შენიშვნა" className="min-w-0 flex-1" />
                        <Button size="sm" variant="secondary" type="submit">OK</Button>
                      </form>
                      <form action={removeFromShortlist}>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="clientId" value={client.id} />
                        <Button size="sm" variant="danger" type="submit">×</Button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="მოთხოვნა">
            <form action={updateClient} className="space-y-2 text-sm">
              <input type="hidden" name="id" value={client.id} />
              <Input name="name" defaultValue={client.name} required placeholder="სახელი" />
              <Input name="phone" defaultValue={client.phone ?? ""} placeholder="ტელეფონი" />
              <Input name="messenger" defaultValue={client.messenger ?? ""} placeholder="WhatsApp / Telegram" />
              <div className="grid grid-cols-2 gap-2">
                <Input name="nationality" defaultValue={client.nationality ?? ""} placeholder="ეროვნება" />
                <Input name="language" defaultValue={client.language ?? ""} placeholder="ენა" />
              </div>
              <Select name="segment" defaultValue={client.segment ?? ""}>
                <option value="">სეგმენტი</option>
                {CLIENT_SEGMENTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
              <Select name="dealType" defaultValue={client.dealType ?? ""}>
                <option value="">გარიგება: ყველა</option>
                <option value="ქირავდება">ქირავდება</option>
                <option value="ქირავდება დღიურად">ქირავდება დღიურად</option>
                <option value="იყიდება">იყიდება</option>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <Input name="budgetMin" defaultValue={client.budgetMin ?? ""} placeholder="ბიუჯეტი $ დან" inputMode="numeric" />
                <Input name="budgetMax" defaultValue={client.budgetMax ?? ""} placeholder="ბიუჯეტი $ მდე" inputMode="numeric" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input name="roomsMin" defaultValue={client.roomsMin ?? ""} placeholder="ოთახი (მინ.)" inputMode="numeric" />
                <Input name="durationMonths" defaultValue={client.durationMonths ?? ""} placeholder="ვადა, თვე" inputMode="numeric" />
              </div>
              <Input name="areas" defaultValue={client.areas ?? ""} placeholder="უბნები მძიმით: ვაკე, საბურთალო" />
              <Input name="moveIn" type="date" defaultValue={toDateInput(client.moveIn)} />
              <Select name="assignedToId" defaultValue={client.assignedToId ?? ""}>
                <option value="">— აგენტი</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>
              <textarea name="notes" defaultValue={client.notes ?? ""} rows={4} placeholder="შენიშვნები" className="ui-field h-auto py-2" />
              <Button type="submit" className="w-full">შენახვა</Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
