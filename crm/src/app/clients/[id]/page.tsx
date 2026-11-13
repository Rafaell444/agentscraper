import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isPartner, requireMember } from "@/lib/auth";
import { fmtDate, fmtMoney, fmtNum, waHref } from "@/lib/format";
import { CLIENT_SEGMENTS, CLIENT_STATUSES, SHORTLIST_STATUSES, splitAreas } from "@/lib/clients";
import { Button, Card, Input, PageHeader, PhoneButton, PosterBadge, Select, SiteBadge } from "@/components/ui";
import { addToShortlist, removeFromShortlist, setClientStatus, updateClient, updateShortlist } from "../actions";
import { WaTemplates } from "@/components/WaTemplates";
import { createViewing } from "@/app/viewings/actions";
import { getSettings } from "@/lib/settings";
import { renderTemplate, waLink } from "@/lib/templates";
import { CLIENT_STATUS_EN, SEGMENT_EN, Tx, VIEWING_STATUS_EN, tx } from "@/lib/partnerText";

export const dynamic = "force-dynamic";

function toDateInput(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMember();
  const partner = isPartner(me);
  const { id } = await params;
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      assignedTo: true,
      shortlists: { include: { listing: { include: { lead: { select: { manualPhone: true } } } } }, orderBy: { createdAt: "desc" } },
    },
  });
  // A partner opens only clients of his segment.
  if (!client || (partner && client.segment !== me.segment)) notFound();
  const [users, settings, viewings] = await Promise.all([
    prisma.user.findMany({ where: partner ? { id: me.id } : { active: true }, orderBy: { name: "asc" } }),
    getSettings(),
    prisma.viewing.findMany({ where: { clientId: client.id }, include: { listing: { select: { id: true, title: true, address: true } }, agent: { select: { name: true } } }, orderBy: { scheduledAt: "desc" }, take: 10 }),
  ]);
  const publicBase = settings.public_base_url.replace(/\/$/, "");
  const lang = partner ? "en" : (client.language ?? "").toLowerCase().startsWith("ru") || client.segment === "ru" ? "ru" : client.language && !client.language.toLowerCase().startsWith("ka") && !client.language.toLowerCase().startsWith("ქართ") ? "en" : "ka";
  const templateValues = { name: client.name.split(" ")[0], agent: me.name, agency: settings.agency_name, phone: settings.agency_phone, listing: "", price: "", area: "", time: "", address: "", link: "" };

  // Listings matching the client's wishes (newest first), excluding ones already shortlisted.
  const areas = splitAreas(client.areas);
  const where: Prisma.ListingWhereInput = { archived: false, id: { notIn: client.shortlists.map((s) => s.listingId) } };
  if (client.dealType) where.dealType = client.dealType;
  if (client.budgetMin != null || client.budgetMax != null) where.priceUsd = { gte: client.budgetMin ?? undefined, lte: client.budgetMax ?? undefined };
  if (client.roomsMin) where.rooms = { gte: client.roomsMin };
  if (areas.length) where.OR = [{ neighbourhood: { in: areas } }, { district: { in: areas } }];
  const matches = partner ? [] : await prisma.listing.findMany({
    where,
    orderBy: { collectedAt: "desc" },
    take: 30,
    include: { lead: { select: { manualPhone: true, status: true } } },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/clients" className="ui-btn ui-btn-ghost ui-btn-sm -ml-2">← {tx(partner, "კლიენტები", "My clients")}</Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <PageHeader
            title={client.name}
            subtitle={[client.nationality, partner ? SEGMENT_EN[client.segment ?? ""] : CLIENT_SEGMENTS.find((s) => s.value === client.segment)?.label, client.language].filter(Boolean).join(" · ")}
            actions={
              <>
                <PhoneButton phone={client.phone} size="md" />
                {client.phone || client.messenger ? (
                  <a href={waHref(client.messenger || client.phone)} target="_blank" rel="noreferrer" className="ui-btn ui-btn-secondary">WhatsApp</a>
                ) : null}
              </>
            }
          />

          <Card title={<Tx p={partner} ka="სწრაფი კავშირი" en="Quick message" hi="जल्दी संदेश" />}>
            <WaTemplates phone={client.messenger || client.phone} kinds={["client_first", "client_followup"]} values={templateValues} english={partner} />
          </Card>

          <Card title={<Tx p={partner} ka="სტატუსი" en="Status" hi="स्थिति" />}>
            <div className="flex flex-wrap gap-1.5">
              {CLIENT_STATUSES.map((s) => (
                <form key={s.value} action={setClientStatus}>
                  <input type="hidden" name="id" value={client.id} />
                  <input type="hidden" name="status" value={s.value} />
                  <button type="submit" className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${client.status === s.value ? `${s.color} border-transparent ring-2 ring-emerald-500/30` : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
                    {partner ? CLIENT_STATUS_EN[s.value] : s.label}
                  </button>
                </form>
              ))}
            </div>
          </Card>

          {/* Our listings and owners' numbers: agency staff only, not a partner. */}
          {!partner ? (
            <>
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
                    <div className="flex flex-wrap items-center gap-1 text-xs">
                      {item.note === "auto" ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">ავტომატური დამთხვევა</span> : null}
                      {client.messenger || client.phone ? (
                        <a
                          href={waLink(client.messenger || client.phone, renderTemplate("client_card", lang, { ...templateValues, listing: item.listing.title ?? "", price: fmtMoney(item.listing.priceUsd), area: item.listing.areaM2 ? `${fmtNum(item.listing.areaM2)} m²` : "", link: `${publicBase}/p/l/${item.listingId}?lang=${lang}` }))}
                          target="_blank"
                          rel="noreferrer"
                          className="ui-chip"
                        >
                          💬 ბარათის გაგზავნა ({lang.toUpperCase()})
                        </a>
                      ) : null}
                      <a href={`/p/l/${item.listingId}?lang=${lang}`} target="_blank" rel="noreferrer" className="ui-chip">ბარათი ↗</a>
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
            </>
          ) : (
            <Card title={<Tx p={partner} ka="ბინების შერჩევა" en="Find flats" hi="फ़्लैट खोजें" />}>
              <p className="text-sm text-gray-600">
                Send matching flats from our catalog:{" "}
                <a href="/catalog?lang=en" target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 underline">Catalog ↗</a>
                {" · "}
                <a href="/share" className="font-semibold text-emerald-700 underline">Share to WhatsApp</a>
              </p>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card title={<Tx p={partner} ka="დათვალიერება" en="Plan a viewing" hi="विज़िट तय करें" />}>
            <form action={createViewing} className="space-y-2 text-sm">
              <input type="hidden" name="clientId" value={client.id} />
              <input type="hidden" name="agentId" value={client.assignedToId ?? me.id} />
              <Input name="scheduledAt" type="datetime-local" required />
              {!partner ? (
                <Select name="listingId" defaultValue="">
                  <option value="">ობიექტი (შერჩეულებიდან)</option>
                  {client.shortlists.map((s) => (
                    <option key={s.listingId} value={s.listingId}>{s.listing.title ?? s.listingId}</option>
                  ))}
                </Select>
              ) : null}
              <Input name="address" placeholder={tx(partner, "მისამართი / შეხვედრის ადგილი", "Address / meeting place")} />
              <Button type="submit" variant="secondary" className="w-full">{tx(partner, "დაგეგმვა", "Plan")}</Button>
            </form>
            {viewings.length ? (
              <ul className="mt-2 space-y-1 border-t border-gray-100 pt-2 text-xs text-gray-600">
                {viewings.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-1">
                    <span>{fmtDate(v.scheduledAt, true)} · {v.listing?.title ?? v.address ?? ""} · {partner ? VIEWING_STATUS_EN[v.status] ?? v.status : v.status}</span>
                    {client.messenger || client.phone ? (
                      <a
                        href={waLink(client.messenger || client.phone, renderTemplate("viewing_confirm", lang, { ...templateValues, time: fmtDate(v.scheduledAt, true), address: v.address ?? v.listing?.address ?? "", listing: v.listing?.title ?? "", price: "" }))}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-700 hover:underline"
                      >
                        💬 {tx(partner, "დადასტურება", "Confirm")}
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          <Card title={<Tx p={partner} ka="მოთხოვნა" en="Client details" hi="ग्राहक की जानकारी" />}>
            <form action={updateClient} className="space-y-2 text-sm">
              <input type="hidden" name="id" value={client.id} />
              <Input name="name" defaultValue={client.name} required placeholder={tx(partner, "სახელი", "Name")} />
              <Input name="phone" defaultValue={client.phone ?? ""} placeholder={tx(partner, "ტელეფონი", "Phone")} />
              <Input name="messenger" defaultValue={client.messenger ?? ""} placeholder="WhatsApp / Telegram" />
              <div className="grid grid-cols-2 gap-2">
                <Input name="nationality" defaultValue={client.nationality ?? ""} placeholder={tx(partner, "ეროვნება", "Nationality")} />
                <Input name="language" defaultValue={client.language ?? ""} placeholder={tx(partner, "ენა", "Language")} />
              </div>
              <Select name="segment" defaultValue={client.segment ?? ""} disabled={partner}>
                <option value="">{tx(partner, "სეგმენტი", "Segment")}</option>
                {CLIENT_SEGMENTS.map((s) => (
                  <option key={s.value} value={s.value}>{partner ? SEGMENT_EN[s.value] : s.label}</option>
                ))}
              </Select>
              <Select name="dealType" defaultValue={client.dealType ?? ""}>
                <option value="">{tx(partner, "გარიგება: ყველა", "Deal: any")}</option>
                <option value="ქირავდება">{tx(partner, "ქირავდება", "Rent")}</option>
                <option value="ქირავდება დღიურად">{tx(partner, "ქირავდება დღიურად", "Daily rent")}</option>
                <option value="იყიდება">{tx(partner, "იყიდება", "Sale")}</option>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <Input name="budgetMin" defaultValue={client.budgetMin ?? ""} placeholder={tx(partner, "ბიუჯეტი $ დან", "Budget from $")} inputMode="numeric" />
                <Input name="budgetMax" defaultValue={client.budgetMax ?? ""} placeholder={tx(partner, "ბიუჯეტი $ მდე", "Budget to $")} inputMode="numeric" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input name="roomsMin" defaultValue={client.roomsMin ?? ""} placeholder={tx(partner, "ოთახი (მინ.)", "Rooms (min)")} inputMode="numeric" />
                <Input name="durationMonths" defaultValue={client.durationMonths ?? ""} placeholder={tx(partner, "ვადა, თვე", "Months")} inputMode="numeric" />
              </div>
              <Input name="areas" defaultValue={client.areas ?? ""} placeholder={tx(partner, "უბნები მძიმით: ვაკე, საბურთალო", "Areas: Vake, Saburtalo")} />
              <Input name="moveIn" type="date" defaultValue={toDateInput(client.moveIn)} title={tx(partner, "შესვლის თარიღი", "Move-in date")} />
              <Select name="assignedToId" defaultValue={client.assignedToId ?? ""}>
                <option value="">{tx(partner, "— აგენტი", "— Agent")}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>
              <textarea name="notes" defaultValue={client.notes ?? ""} rows={4} placeholder={tx(partner, "შენიშვნები", "Notes")} className="ui-field h-auto py-2" />
              <Button type="submit" className="w-full">{tx(partner, "შენახვა", "Save")}</Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
