import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PRIORITIES, STATUSES, statusColor } from "@/lib/options";
import { fmtDate, fmtMoney, fmtNum, waHref } from "@/lib/format";
import { Button, Card, Input, LinkButton, PhoneButton, PosterBadge, Select, SiteBadge, StatusBadge } from "@/components/ui";
import { addNote, logCall, queuePublication, setFollowUp, setHidden, setManualPhone, setReposted, setStatus, updateLead } from "./actions";
import { ListingsLink } from "@/components/ListingsLink";
import { getSettings } from "@/lib/settings";
import { buildPublicationText } from "@/lib/publishText";
import { benchmark } from "@/lib/market";
import { WaTemplates } from "@/components/WaTemplates";
import { createViewing } from "@/app/viewings/actions";
import { createDeal } from "@/app/deals/actions";
import { createPostFromListing } from "@/app/shared/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { CadastralBox } from "@/components/CadastralBox";
import { PhoneMatchesButton } from "@/components/PhoneMatches";
import { codeFor } from "@/lib/cadastre";
import { findPhoneMatches } from "@/lib/phones";

export const dynamic = "force-dynamic";
// "Post for client" downloads the listing's photos.
export const maxDuration = 60;

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-sm font-medium text-gray-900">{value}</div>
    </div>
  );
}

function toLocalInput(date: Date | null | undefined): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const ACTIVITY_LABELS: Record<string, string> = { status: "სტატუსი", assign: "მიკუთვნება", note: "ჩანაწერი", call: "ზარი", followup: "დასარეკი" };

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const listing = await prisma.listing.findUnique({
    where: { id: decodeURIComponent(id) },
    include: {
      lead: { include: { assignedTo: true, repostedBy: { select: { name: true } } } },
      notes: { include: { user: true }, orderBy: { createdAt: "desc" } },
      activities: { include: { user: true }, orderBy: { createdAt: "desc" }, take: 30 },
      priceHistory: { orderBy: { seenAt: "asc" } },
      publications: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!listing) notFound();
  const [settings, bench, clients, viewings, cadastral, phoneMatches] = await Promise.all([
    getSettings(),
    benchmark(listing),
    prisma.client.findMany({ where: { status: { notIn: ["closed_won", "closed_lost"] } }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 }),
    prisma.viewing.findMany({ where: { listingId: listing.id }, include: { client: { select: { name: true } }, agent: { select: { name: true } } }, orderBy: { scheduledAt: "desc" }, take: 5 }),
    codeFor(listing.address),
    // Other listings and street banners with this number.
    findPhoneMatches(listing.phone || listing.lead?.manualPhone).then((all) => all.filter((m) => m.id !== listing.id)),
  ]);
  const defaultText = buildPublicationText(listing, settings.agency_phone, settings.agency_name);
  const publicBase = settings.public_base_url.replace(/\/$/, "");
  const publicCard = `${publicBase}/p/l/${listing.id}`;
  const templateValues = {
    agent: me.name,
    agency: settings.agency_name,
    phone: settings.agency_phone,
    listing: listing.title ?? "",
    price: fmtMoney(listing.priceUsd) || fmtMoney(listing.priceGel, "₾"),
    area: listing.areaM2 ? `${fmtNum(listing.areaM2)} მ²` : "",
    address: listing.address ?? listing.neighbourhood ?? "",
    link: publicCard,
    name: "",
    time: "",
  };
  const PUB_STATUS: Record<string, string> = { queued: "რიგშია", posted: "გამოქვეყნდა", failed: "შეცდომა", manual: "ხელით", cancelled: "გაუქმდა" };
  // Other postings of the same property.  "Confirmed" copies share the full
  // property key (deal, area, rooms, place, floor, street).  "Possible" ones
  // share deal, rooms, place and a similar area, plus at least one more
  // signal (price within 10 %, same floor or same street), for the agent to judge.
  const copySelect = {
    id: true, site: true, siteName: true, title: true, posterKind: true, ownerType: true, ownerName: true, phone: true,
    priceUsd: true, postedAt: true, collectedAt: true, archived: true, floor: true, totalFloors: true, areaM2: true, address: true,
    propertyKey: true, lead: { select: { status: true } },
  } as const;
  const confirmed = listing.propertyKey
    ? await prisma.listing.findMany({ where: { propertyKey: listing.propertyKey, NOT: { id: listing.id } }, select: copySelect, orderBy: { collectedAt: "desc" }, take: 20 })
    : [];
  const streetToken = (address: string | null | undefined) => {
    const noise = new Set(["ქ", "ქუჩა", "ქუჩაზე", "გამზ", "გამზირი", "გამზირზე", "ჩიხი", "შეს", "შესახვევი", "ხეივანი", "ხეივ", "მოედანი", "დასახლება", "დას", "კორპ", "ბინა"]);
    const words = (address ?? "").toLowerCase().replace(/[\d.,;:/()\-–№#]+/g, " ").split(/\s+/);
    const word = words.find((w) => w.length >= 4 && !noise.has(w));
    return word ? word.slice(0, 5) : "";
  };
  const candidates =
    listing.dealType && listing.rooms && listing.areaM2 && (listing.neighbourhood || listing.district)
      ? await prisma.listing.findMany({
          where: {
            dealType: listing.dealType,
            rooms: listing.rooms,
            areaM2: { gte: listing.areaM2 - 2, lte: listing.areaM2 + 2 },
            ...(listing.neighbourhood ? { neighbourhood: listing.neighbourhood } : { district: listing.district }),
            NOT: { id: { in: [listing.id, ...confirmed.map((c) => c.id)] } },
          },
          select: copySelect,
          orderBy: { collectedAt: "desc" },
          take: 60,
        })
      : [];
  const myStreet = streetToken(listing.address);
  const possible = candidates
    .map((c) => {
      const reasons: string[] = [];
      if (listing.priceUsd && c.priceUsd && Math.abs(c.priceUsd - listing.priceUsd) / listing.priceUsd <= 0.1) reasons.push("ფასი");
      if (listing.floor != null && c.floor != null && listing.floor === c.floor) reasons.push("სართული");
      if (myStreet && streetToken(c.address) === myStreet) reasons.push("ქუჩა");
      return { ...c, reasons };
    })
    .filter((c) => c.reasons.length > 0)
    .sort((a, b) => b.reasons.length - a.reasons.length)
    .slice(0, 10);
  const sameProperty = [...confirmed.map((c) => ({ ...c, reasons: ["ქუჩა", "სართული"] })), ...possible];
  const prices = listing.priceHistory.map((p) => p.priceUsd).filter((p): p is number => p != null);
  const priceChange = prices.length >= 2 ? prices[prices.length - 1] - prices[0] : 0;
  const ownerCopies = confirmed.filter((c) => c.posterKind === "owner").length;
  const agentCopies = confirmed.filter((c) => c.posterKind === "agent").length;
  const users = await prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const firstPhone = (listing.phone ?? "").split(";")[0].trim();
  const samePhone = firstPhone
    ? await prisma.listing.findMany({
        where: { phone: { contains: firstPhone }, NOT: { id: listing.id } },
        select: { id: true, title: true, siteName: true, priceUsd: true, collectedAt: true },
        take: 10,
      })
    : [];
  const phones = (listing.phone ?? "").split(";").map((p) => p.trim()).filter(Boolean);
  if (listing.lead?.manualPhone) phones.unshift(listing.lead.manualPhone);
  // Phone of the same property on another site (confirmed copy) when this one has none.
  const linked = phones.length ? null : confirmed.find((c) => c.phone) ?? null;
  if (linked?.phone) phones.push(linked.phone.split(";")[0].trim());
  const currentStatus = listing.lead?.status ?? "new";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ListingsLink className="ui-btn ui-btn-ghost ui-btn-sm -ml-2">← განცხადებები</ListingsLink>
        <div className="flex gap-2">
          {listing.link ? (
            <LinkButton href={listing.link} external size="sm">
              საიტზე ნახვა ↗
            </LinkButton>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <div className="flex flex-col gap-4 md:flex-row">
              {listing.image ? (
                <img src={listing.image} alt="" className="h-52 w-full rounded-xl object-cover md:w-64" />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <SiteBadge site={listing.site} name={listing.siteName} />
                  <PosterBadge kind={listing.posterKind} ownerType={listing.ownerType} />
                  <StatusBadge status={currentStatus} />
                  {confirmed.length ? (
                    <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">კიდევ {confirmed.length} განცხადება ამ ობიექტზე</span>
                  ) : possible.length ? (
                    <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">{possible.length} შესაძლო დუბლი</span>
                  ) : null}
                  {priceChange < 0 ? <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800">ფასი ↓ {fmtMoney(Math.abs(priceChange))}</span> : null}
                  {priceChange > 0 ? <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[11px] font-semibold text-rose-800">ფასი ↑ {fmtMoney(priceChange)}</span> : null}
                  {listing.archived ? <span className="rounded-md bg-gray-200 px-1.5 py-0.5 text-[11px] font-medium">არქივი</span> : null}
                  {listing.lead?.repostedId ? <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-800">გაზიარებული: {listing.lead.repostedId}</span> : null}
                  {listing.vip ? <span className="rounded-md bg-yellow-100 px-1.5 py-0.5 text-[11px] font-medium text-yellow-800">{listing.vip}</span> : null}
                </div>
                <h1 className="text-xl font-bold leading-snug text-gray-900">{listing.title ?? listing.propertyId}</h1>
                <p className="mt-0.5 text-sm text-gray-500">{[listing.city, listing.district, listing.neighbourhood, listing.address].filter(Boolean).join(" · ")}</p>
                <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="text-3xl font-bold tabular-nums text-emerald-700">{fmtMoney(listing.priceUsd) || fmtMoney(listing.priceGel, "₾")}</span>
                  {listing.priceUsd && listing.priceGel ? <span className="text-sm text-gray-500">{fmtMoney(listing.priceGel, "₾")}</span> : null}
                  {listing.pricePerM2Usd ? <span className="text-sm text-gray-500">{fmtNum(listing.pricePerM2Usd)} $/მ²</span> : null}
                </div>
                {bench && bench.diffPct != null ? (
                  <div className={`mt-2 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${bench.diffPct <= -10 ? "bg-emerald-50 text-emerald-800" : bench.diffPct >= 10 ? "bg-rose-50 text-rose-800" : "bg-gray-50 text-gray-700"}`}>
                    <span className="font-semibold">{bench.diffPct > 0 ? "+" : ""}{bench.diffPct}%</span>
                    <span className="text-xs">მედიანასთან შედარებით ({fmtNum(bench.medianPpm)} $/მ², {bench.scope}, {bench.samples} განცხადება)</span>
                  </div>
                ) : null}
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Fact label="გარიგება" value={listing.dealType} />
                  <Fact label="ტიპი" value={listing.propertyType} />
                  <Fact label="ფართი" value={listing.areaM2 ? `${fmtNum(listing.areaM2)} მ²` : ""} />
                  <Fact label="ოთახი" value={listing.rooms} />
                  <Fact label="საძინებელი" value={listing.bedrooms} />
                  <Fact label="სართული" value={listing.floor != null ? `${listing.floor}${listing.totalFloors ? ` / ${listing.totalFloors}` : ""}` : ""} />
                  <Fact label="სტატუსი" value={listing.status} />
                  <Fact label="მდგომარეობა" value={listing.condition} />
                  <Fact label="სველი წერტილი" value={listing.bathrooms} />
                  <Fact label="ეზო" value={listing.yardAreaM2 ? `${fmtNum(listing.yardAreaM2)} მ²` : ""} />
                  <Fact label="განთავსდა" value={fmtDate(listing.postedAt, true)} />
                  <Fact label="დავინახეთ" value={fmtDate(listing.collectedAt, true)} />
                </div>
              </div>
            </div>
            {listing.description ? <div className="mt-4 whitespace-pre-line border-t border-gray-100 pt-3 text-sm leading-relaxed text-gray-800">{listing.description}</div> : null}
            <div className="mt-3 text-xs text-gray-400">ID {listing.propertyId} · განახლდა საიტზე {fmtDate(listing.siteUpdatedAt, true) || "—"}</div>
          </Card>

          <Card
            title={confirmed.length ? `იგივე ობიექტი: კიდევ ${confirmed.length} განცხადება` : possible.length ? `შესაძლო დუბლები: ${possible.length}` : "იგივე ობიექტი"}
            action={
              confirmed.length ? (
                <span className="text-xs text-gray-500">
                  {ownerCopies ? `${ownerCopies} მესაკუთრისგან` : ""}
                  {ownerCopies && agentCopies ? " · " : ""}
                  {agentCopies ? `${agentCopies} აგენტისგან` : ""}
                </span>
              ) : null
            }
          >
            {sameProperty.length === 0 ? (
              <p className="text-sm text-gray-400">
                სხვა განცხადება ამ ობიექტზე არ ჩანს
                {listing.posterKind === "owner" ? " — სავარაუდოდ აგენტებთან ჯერ არ მუშაობს." : ""}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="py-1 pr-2">საიტი</th>
                      <th className="py-1 pr-2">ვინ</th>
                      <th className="py-1 pr-2">სახელი / ტელეფონი</th>
                      <th className="py-1 pr-2 text-right">ფასი</th>
                      <th className="py-1 pr-2">სართ. / მისამართი</th>
                      <th className="py-1 pr-2">განთავსდა</th>
                      <th className="py-1">ემთხვევა</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sameProperty.map((copy, index) => (
                      <tr key={copy.id} className={`border-t border-gray-100 ${copy.archived ? "opacity-50" : ""} ${index >= confirmed.length ? "bg-gray-50/60" : ""}`}>
                        <td className="py-1.5 pr-2">
                          <Link href={`/listings/${copy.id}`} className="hover:underline">
                            <SiteBadge site={copy.site} name={copy.siteName} />
                          </Link>
                        </td>
                        <td className="py-1.5 pr-2">
                          <PosterBadge kind={copy.posterKind} ownerType={copy.ownerType} />
                        </td>
                        <td className="py-1.5 pr-2">
                          <div className="text-gray-800">{copy.ownerName || "—"}</div>
                          {copy.phone ? <PhoneButton phone={copy.phone} /> : <span className="text-xs text-gray-400">ნომერი არ არის</span>}
                        </td>
                        <td className={`py-1.5 pr-2 text-right font-semibold tabular-nums ${copy.priceUsd && listing.priceUsd && copy.priceUsd < listing.priceUsd ? "text-emerald-700" : "text-gray-900"}`}>
                          {fmtMoney(copy.priceUsd)}
                        </td>
                        <td className="py-1.5 pr-2 text-xs text-gray-600">
                          {copy.floor != null ? `${copy.floor}${copy.totalFloors ? `/${copy.totalFloors}` : ""} სართ.` : "—"}
                          <div className="truncate text-gray-500">{copy.address ?? ""}</div>
                        </td>
                        <td className="py-1.5 pr-2 text-xs text-gray-500">{fmtDate(copy.postedAt ?? copy.collectedAt)}</td>
                        <td className="py-1.5">
                          {index < confirmed.length ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">დადასტურებული</span>
                          ) : (
                            <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-700">შესაძლო: {copy.reasons.join(", ")}</span>
                          )}
                          <div className="mt-0.5"><StatusBadge status={copy.lead?.status} /></div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-gray-400">დადასტურებული = იგივე გარიგება, ფართი, ოთახები, უბანი, სართული და ქუჩა. შესაძლო = იგივე ფართი/ოთახები/უბანი და ერთი დამატებითი ნიშანი (ფასი ±10%, სართული ან ქუჩა) — შეამოწმე.</p>
              </div>
            )}
            {listing.priceHistory.length > 1 ? (
              <div className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-600">
                <span className="font-medium text-gray-700">ფასის ისტორია: </span>
                {listing.priceHistory.map((p, i) => (
                  <span key={p.id}>
                    {i ? " → " : ""}
                    {fmtMoney(p.priceUsd)} <span className="text-gray-400">({fmtDate(p.seenAt)})</span>
                  </span>
                ))}
              </div>
            ) : null}
          </Card>

          <Card title="ჩანაწერები">
            <form action={addNote} className="mb-3 flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="listingId" value={listing.id} />
              <Input name="text" required placeholder="რა ითქვა საუბარში…" className="min-w-0 flex-1" />
              <Button type="submit">დამატება</Button>
            </form>
            {listing.notes.length === 0 ? <p className="text-sm text-gray-400">ჩანაწერები ჯერ არ არის</p> : null}
            <ul className="space-y-2">
              {listing.notes.map((note) => (
                <li key={note.id} className="rounded-xl bg-gray-50 p-3 text-sm">
                  <div className="text-gray-900">{note.text}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {note.user.name} · {fmtDate(note.createdAt, true)}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="ისტორია">
            {listing.activities.length === 0 ? <p className="text-sm text-gray-400">ჯერ არაფერი</p> : null}
            <ul className="space-y-1.5 text-xs text-gray-600">
              {listing.activities.map((activity) => (
                <li key={activity.id} className="flex gap-2">
                  <span className="shrink-0 tabular-nums text-gray-400">{fmtDate(activity.createdAt, true)}</span>
                  <span>
                    <span className="font-medium text-gray-700">{activity.user.name}</span> · {ACTIVITY_LABELS[activity.type] ?? activity.type}
                    {activity.detail ? `: ${activity.detail}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-16 lg:self-start">
          <Card title="მესაკუთრე">
            <div className="text-lg font-semibold text-gray-900">{listing.ownerName || "—"}</div>
            <div className="text-xs text-gray-500">{listing.ownerType ?? ""}</div>
            {phones.length ? (
              <ul className="mt-3 space-y-2">
                {phones.map((phone) => (
                  <li key={phone} className="flex items-center gap-2">
                    <PhoneButton phone={phone} size="md" />
                    <a href={waHref(phone)} target="_blank" rel="noreferrer" className="ui-btn ui-btn-secondary" aria-label="WhatsApp">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-green-600">
                        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20zm4.4-6c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1-.6.8-.8 1-.3.2-.5.1a6.5 6.5 0 0 1-3.2-2.8c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.7-1.7c-.2-.5-.4-.4-.5-.4h-.5a1 1 0 0 0-.7.3 2.9 2.9 0 0 0-.9 2.2 5 5 0 0 0 1 2.6 11.4 11.4 0 0 0 4.4 3.9c1.6.7 2.2.7 3 .6a2.6 2.6 0 0 0 1.7-1.2 2 2 0 0 0 .2-1.2c-.1-.1-.3-.2-.5-.3z" />
                      </svg>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-gray-400">ნომერი ჯერ არ არის გამოვლენილი</p>
            )}
            {linked ? (
              <p className="mt-1 text-xs text-amber-700">
                ნომერი იგივე ობიექტის განცხადებიდან {linked.siteName}-ზე ({linked.ownerName || "—"}) — <Link href={`/listings/${linked.id}`} className="underline">ნახვა</Link>
              </p>
            ) : null}
            <form action={setManualPhone} className="mt-3 flex gap-1">
              <input type="hidden" name="listingId" value={listing.id} />
              <Input name="manualPhone" defaultValue={listing.lead?.manualPhone ?? ""} placeholder="ნომერი ხელით (მაგ. MyHome-დან)" inputMode="tel" className="min-w-0 flex-1" />
              <Button type="submit" variant="secondary">✓</Button>
            </form>
            {listing.site === "myhome" && !listing.phone ? (
              <p className="mt-1 text-xs text-gray-500">MyHome-ზე ღილაკი „ნომრის ნახვა“ → ჩაწერე აქ.</p>
            ) : null}
            <form action={logCall} className="mt-3">
              <input type="hidden" name="listingId" value={listing.id} />
              <Button type="submit" variant="secondary" className="w-full">
                ✓ დავრეკე — ჩაწერე ზარი
              </Button>
            </form>
            <div className="mt-3 border-t border-gray-100 pt-3">
              <WaTemplates phone={phones[0]} kinds={["owner_first", "owner_followup"]} values={templateValues} />
            </div>
          </Card>

          <Card title="ჩვენი განცხადება (აგენტის ასლი)">
            <p className="text-xs text-gray-500">თუ ეს ობიექტი შენი პროფილიდანაც დადე (MyHome, SS.ge…), ჩაწერე იმ განცხადების ID ან ბმული — გამოჩნდება სიაში და ფილტრში „გაზიარებული“.</p>
            <form action={setReposted} className="mt-2 flex gap-1">
              <input type="hidden" name="listingId" value={listing.id} />
              <Input name="repostedId" defaultValue={listing.lead?.repostedId ?? ""} placeholder="ID ან ბმული" className="min-w-0 flex-1" />
              <Button type="submit" variant="secondary">✓</Button>
            </form>
            {listing.lead?.repostedId ? (
              <p className="mt-1 text-xs text-emerald-700">
                გაზიარებულია: {listing.lead.repostedId} · {listing.lead.repostedBy?.name ?? ""} · {fmtDate(listing.lead.repostedAt)}
              </p>
            ) : null}
          </Card>

          <Card title="საჯარო ბარათი კლიენტისთვის">
            <p className="text-xs text-gray-500">გვერდი ჩვენი კონტაქტით, მესაკუთრის ნომრის გარეშე — გაუგზავნე კლიენტს ორიგინალი ბმულის ნაცვლად.</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {(["en", "ru", "ka"] as const).map((l) => (
                <a key={l} href={`/p/l/${listing.id}?lang=${l}`} target="_blank" rel="noreferrer" className="ui-chip">{l.toUpperCase()} ↗</a>
              ))}
            </div>
            <input readOnly value={publicCard} className="ui-field mt-2 text-xs" onFocus={undefined} />
            <form action={createPostFromListing} className="mt-3 border-t border-gray-100 pt-3">
              <input type="hidden" name="listingId" value={listing.id} />
              <p className="mb-2 text-xs text-gray-500">ან შექმენი პირადი პოსტი: ტექსტს, ფოტოებს და ნომერს შეცვლი, კლიენტი სხვა განცხადებებს ვერ ნახავს.</p>
              <SubmitButton pending="იქმნება… (ფოტოები)" className="ui-btn ui-btn-primary ui-btn-sm">პოსტი კლიენტისთვის →</SubmitButton>
            </form>
          </Card>

          <Card title="საკადასტრო კოდი">
            {listing.cadastralCode ? (
              <p className="mb-2 text-sm">
                <span className="font-mono font-semibold">{listing.cadastralCode}</span>
                <span className="ml-2 text-xs text-gray-500">განცხადებიდან ({listing.siteName})</span>
              </p>
            ) : null}
            <CadastralBox address={listing.address} code={cadastral ?? listing.cadastralCode} back={`/listings/${encodeURIComponent(listing.id)}`} />
          </Card>

          {phoneMatches.length ? (
            <Card title="იგივე ნომერი CRM-ში">
              <PhoneMatchesButton matches={phoneMatches} phone={(listing.phone || listing.lead?.manualPhone || "").split(";")[0]} />
            </Card>
          ) : null}

          <Card title="დათვალიერების დაგეგმვა">
            <form action={createViewing} className="space-y-2 text-sm">
              <input type="hidden" name="listingId" value={listing.id} />
              <input type="hidden" name="agentId" value={me.id} />
              <input type="hidden" name="address" value={listing.address ?? ""} />
              <Input name="scheduledAt" type="datetime-local" required />
              <Select name="clientId" defaultValue="">
                <option value="">კლიენტი (არასავალდებულო)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
              <Button type="submit" variant="secondary" className="w-full">დაგეგმვა</Button>
            </form>
            {viewings.length ? (
              <ul className="mt-2 space-y-1 border-t border-gray-100 pt-2 text-xs text-gray-600">
                {viewings.map((v) => (
                  <li key={v.id}>{fmtDate(v.scheduledAt, true)} · {v.agent.name}{v.client ? ` · ${v.client.name}` : ""} · {v.status}</li>
                ))}
              </ul>
            ) : null}
          </Card>

          <Card title="გარიგება დაიდო?">
            <form action={createDeal} className="grid grid-cols-2 gap-2 text-sm">
              <input type="hidden" name="listingId" value={listing.id} />
              <input type="hidden" name="agentId" value={listing.lead?.assignedToId ?? me.id} />
              <Select name="kind" defaultValue={listing.dealType === "იყიდება" ? "sale" : listing.dealType === "ქირავდება დღიურად" ? "daily" : "rent"} className="col-span-2">
                <option value="sale">გაყიდვა</option>
                <option value="rent">გაქირავება</option>
                <option value="daily">დღიური</option>
              </Select>
              <Input name="amount" defaultValue={listing.priceUsd ?? ""} placeholder="თანხა $" inputMode="numeric" required />
              <Input name="commissionPct" placeholder="საკომისიო %" inputMode="numeric" />
              <Select name="clientId" defaultValue="" className="col-span-2">
                <option value="">კლიენტი (არასავალდებულო)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
              <Button type="submit" className="col-span-2">დაფიქსირება</Button>
            </form>
          </Card>

          <Card title="სტატუსი">
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((status) => (
                <form key={status.value} action={setStatus}>
                  <input type="hidden" name="listingId" value={listing.id} />
                  <input type="hidden" name="status" value={status.value} />
                  <button
                    type="submit"
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      currentStatus === status.value ? `${statusColor(status.value)} border-transparent ring-2 ring-emerald-500/30` : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {status.label}
                  </button>
                </form>
              ))}
            </div>
          </Card>

          <Card title="შემდეგი ზარი">
            <div className="flex flex-wrap gap-1.5">
              {[
                { days: 0, label: "დღეს" },
                { days: 1, label: "ხვალ" },
                { days: 3, label: "3 დღეში" },
                { days: 7, label: "1 კვირაში" },
                { days: -1, label: "გაუქმება" },
              ].map((item) => (
                <form key={item.days} action={setFollowUp}>
                  <input type="hidden" name="listingId" value={listing.id} />
                  <input type="hidden" name="days" value={item.days} />
                  <button type="submit" className="ui-chip">
                    {item.label}
                  </button>
                </form>
              ))}
            </div>
            {listing.lead?.followUpAt ? (
              <p className="mt-2 text-sm text-gray-700">
                დაგეგმილია: <span className="font-medium">{fmtDate(listing.lead.followUpAt, true)}</span>
                {listing.lead.assignedTo ? <span className="text-gray-500"> · {listing.lead.assignedTo.name}</span> : null}
              </p>
            ) : (
              <p className="mt-2 text-xs text-gray-400">ზარი არ არის დაგეგმილი</p>
            )}
          </Card>

          <Card title="აგენტი და პრიორიტეტი">
            <form key={listing.lead?.updatedAt?.toISOString() ?? "none"} action={updateLead} className="space-y-3 text-sm">
              <input type="hidden" name="listingId" value={listing.id} />
              <input type="hidden" name="status" value={currentStatus} />
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">პასუხისმგებელი აგენტი</span>
                <Select name="assignedToId" defaultValue={listing.lead?.assignedToId ?? ""}>
                  <option value="">— არავინ</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">ზუსტი დრო</span>
                <Input type="datetime-local" name="followUpAt" defaultValue={toLocalInput(listing.lead?.followUpAt)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">პრიორიტეტი</span>
                <Select name="priority" defaultValue={listing.lead?.priority ?? 0}>
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </label>
              <Button type="submit" className="w-full">
                შენახვა
              </Button>
            </form>
          </Card>

          <Card title="გამოქვეყნება ჩვენი ნომრით" action={<span className="text-xs text-gray-400">Telegram / Facebook / საიტი</span>}>
            <form action={queuePublication} className="space-y-2 text-sm">
              <input type="hidden" name="listingId" value={listing.id} />
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-1.5"><input type="checkbox" name="channel" value="telegram" defaultChecked className="h-4 w-4 accent-emerald-600" /> Telegram</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" name="channel" value="facebook" className="h-4 w-4 accent-emerald-600" /> Facebook</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" name="channel" value="website" className="h-4 w-4 accent-emerald-600" /> საიტი</label>
              </div>
              <Input name="website" placeholder="საიტის სახელი (ხელით დასადები)" />
              <Input name="contactPhone" defaultValue={settings.agency_phone} placeholder="ჩვენი ნომერი პოსტში" />
              <textarea name="text" defaultValue={defaultText} rows={8} className="ui-field h-auto py-2 text-xs" />
              <Button type="submit" variant="secondary" className="w-full">რიგში ჩასმა</Button>
            </form>
            {listing.publications.length ? (
              <ul className="mt-2 space-y-1 border-t border-gray-100 pt-2 text-xs text-gray-600">
                {listing.publications.map((p) => (
                  <li key={p.id}>
                    {p.channel}{p.target ? ` (${p.target})` : ""} · {PUB_STATUS[p.status] ?? p.status} · {fmtDate(p.postedAt ?? p.createdAt, true)}
                    {p.error ? <span className="text-rose-600"> · {p.error.slice(0, 80)}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            <form action={setHidden} className="mt-2 border-t border-gray-100 pt-2">
              <input type="hidden" name="listingId" value={listing.id} />
              <input type="hidden" name="hidden" value={listing.lead?.hidden ? "0" : "1"} />
              <button type="submit" className="text-xs text-gray-500 underline-offset-2 hover:underline">
                {listing.lead?.hidden ? "ჩანს საჯარო გვერდზე: არა — დააბრუნე" : "დამალე საჯარო (QR) გვერდიდან"}
              </button>
            </form>
          </Card>

          {samePhone.length ? (
            <Card title="იგივე ნომრით">
              <ul className="space-y-1.5 text-sm">
                {samePhone.map((other) => (
                  <li key={other.id}>
                    <Link href={`/listings/${other.id}`} className="font-medium text-gray-800 hover:text-emerald-700">
                      {other.title ?? other.id}
                    </Link>
                    <div className="text-xs text-gray-500">
                      {other.siteName} · {fmtMoney(other.priceUsd)} · {fmtDate(other.collectedAt)}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
