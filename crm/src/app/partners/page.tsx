import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { daysAgo, fmtDate } from "@/lib/format";
import { CLIENT_STATUS, CLIENT_STATUSES } from "@/lib/clients";
import { Card, Chip, EmptyState, PageHeader, PhoneButton } from "@/components/ui";
import { fmtMoney } from "@/lib/format";
import { ownerPhones } from "@/lib/ownerPhone";

export const dynamic = "force-dynamic";

// The admin's view of the partners' work (e.g. the agent for Indian
// clients): their clients, viewings, own WhatsApp posts, shares and a
// timeline of everything they did in the CRM.

const TYPE_LABEL: Record<string, string> = {
  client: "👤 კლიენტი",
  client_edit: "✏️ კლიენტი",
  client_status: "🔄 სტატუსი",
  client_link: "🔗 მოწონებული",
  viewing: "📅 ჩვენება",
  viewing_status: "✅ ჩვენება",
  partner_post: "⭐ პოსტი",
  share: "📤 WhatsApp",
};

const VIEWING_LABEL: Record<string, string> = { planned: "დაგეგმილი", done: "ჩატარდა", cancelled: "გაუქმდა", no_show: "არ მოვიდა" };

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <div className="text-2xl font-bold tabular-nums text-gray-900">{value}</div>
      <div className="text-xs text-gray-600">{label}</div>
      {hint ? <div className="text-[11px] text-gray-400">{hint}</div> : null}
    </div>
  );
}

export default async function PartnersPage({ searchParams }: { searchParams: Promise<{ u?: string; days?: string }> }) {
  await requireAdmin();
  const { u = "", days: daysParam = "7" } = await searchParams;
  const days = ["1", "7", "30", "90"].includes(daysParam) ? Number(daysParam) : 7;
  const since = daysAgo(days);
  const partners = await prisma.user.findMany({ where: { role: "partner" }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true, segment: true, active: true } });
  const chosen = partners.find((p) => p.id === u) ?? partners[0];
  const qs = (patch: Record<string, string>) => `/partners?${new URLSearchParams({ u: chosen?.id ?? "", days: String(days), ...patch })}`;

  if (!chosen) {
    return (
      <div className="space-y-4">
        <PageHeader title="პარტნიორების სამუშაო" />
        <Card><EmptyState title="პარტნიორი ჯერ არ არის" hint="დაამატე „აგენტები“ გვერდზე, როლით „პარტნიორი“." /></Card>
      </div>
    );
  }

  const [clients, newClients, viewings, posts, activity] = await Promise.all([
    prisma.client.findMany({ where: { assignedToId: chosen.id }, orderBy: { updatedAt: "desc" }, select: { id: true, name: true, status: true, phone: true, budgetMax: true, areas: true, occupants: true, interests: true, createdAt: true, updatedAt: true } }),
    prisma.client.count({ where: { assignedToId: chosen.id, createdAt: { gte: since } } }),
    prisma.viewing.findMany({ where: { agentId: chosen.id, scheduledAt: { gte: since } }, orderBy: { scheduledAt: "desc" }, take: 100, include: { client: { select: { id: true, name: true } } } }),
    prisma.sharedPost.findMany({ where: { createdById: chosen.id, catalog: false }, orderBy: { updatedAt: "desc" }, take: 50, select: { id: true, title: true, price: true, currency: true, createdAt: true, updatedAt: true } }),
    prisma.activity.findMany({ where: { userId: chosen.id, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 300, select: { id: true, type: true, detail: true, createdAt: true } }),
  ]);
  // Flats his clients liked (links he pasted), with our listing and the owner's number.
  const liked = await prisma.clientLink.findMany({
    where: { client: { assignedToId: chosen.id } },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      client: { select: { id: true, name: true } },
      listing: { select: { id: true, title: true, siteName: true, ownerName: true, phone: true, propertyKey: true, priceUsd: true, archived: true, lead: { select: { manualPhone: true } } } },
    },
  });
  const likedPhones = await ownerPhones(liked.flatMap((l) => (l.listing ? [l.listing] : [])));
  const shares = activity.filter((a) => a.type === "share").length;
  const last = await prisma.activity.findFirst({ where: { userId: chosen.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const byStatus = Object.fromEntries(CLIENT_STATUSES.map((s) => [s.value, clients.filter((c) => c.status === s.value).length]));
  const viewingsDone = viewings.filter((v) => v.status === "done").length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="პარტნიორების სამუშაო"
        subtitle={`${chosen.name} · ${chosen.email}${chosen.active ? "" : " · გათიშული"} · ბოლო აქტივობა: ${last ? fmtDate(last.createdAt, true) : "არასდროს"}`}
        actions={
          <>
            {[1, 7, 30, 90].map((d) => (
              <Chip key={d} href={qs({ days: String(d) })} active={days === d}>{d === 1 ? "დღეს" : `${d} დღე`}</Chip>
            ))}
          </>
        }
      />

      {partners.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {partners.map((p) => (
            <Chip key={p.id} href={qs({ u: p.id })} active={p.id === chosen.id}>{p.name}</Chip>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="კლიენტი სულ" value={clients.length} />
        <Stat label="ახალი კლიენტი" value={newClients} hint={`ბოლო ${days} დღე`} />
        <Stat label="ჩვენება" value={viewings.length} hint={`ჩატარდა ${viewingsDone}`} />
        <Stat label="WhatsApp-ში გაზიარება" value={shares} hint={`ბოლო ${days} დღე`} />
        <Stat label="საკუთარი პოსტი" value={posts.length} />
        <Stat label="დაქირავდა / იყიდა" value={byStatus.closed_won ?? 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={`ქრონოლოგია (ბოლო ${days} დღე, ${activity.length})`} className="lg:col-span-2">
          {activity.length === 0 ? (
            <p className="text-sm text-gray-400">ამ პერიოდში არაფერი გაუკეთებია.</p>
          ) : (
            <ul className="divide-y divide-gray-100 text-sm">
              {activity.map((a) => (
                <li key={a.id} className="flex gap-3 py-1.5">
                  <span className="w-32 shrink-0 tabular-nums text-xs text-gray-500">{fmtDate(a.createdAt, true)}</span>
                  <span className="w-24 shrink-0 text-xs font-medium text-gray-700">{TYPE_LABEL[a.type] ?? a.type}</span>
                  <span className="min-w-0 flex-1 text-gray-800">{a.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card title={`კლიენტები (${clients.length})`}>
            <div className="mb-2 flex flex-wrap gap-1 text-[11px]">
              {CLIENT_STATUSES.map((s) => (
                <span key={s.value} className={`rounded-full px-2 py-0.5 ${s.color}`}>{s.label}: {byStatus[s.value] ?? 0}</span>
              ))}
            </div>
            {clients.length === 0 ? (
              <p className="text-sm text-gray-400">ჯერ არცერთი</p>
            ) : (
              <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto text-sm">
                {clients.slice(0, 100).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                    <div className="min-w-0">
                      <Link href={`/clients/${c.id}`} className="block truncate font-medium text-gray-900 hover:text-emerald-700">{c.name}</Link>
                      <div className="truncate text-[11px] text-gray-500">{[c.budgetMax ? `≤ ${fmtMoney(c.budgetMax)}` : "", c.occupants ? `${c.occupants} ადამიანი` : "", c.areas ?? "", c.interests ?? ""].filter(Boolean).join(" · ")}</div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${(CLIENT_STATUS[c.status] ?? CLIENT_STATUS.new).color}`}>{(CLIENT_STATUS[c.status] ?? CLIENT_STATUS.new).label}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`კლიენტებს მოწონებული ბინები (${liked.length})`}>
            {liked.length === 0 ? (
              <p className="text-sm text-gray-400">ბმული ჯერ არ ჩაუსვამს</p>
            ) : (
              <ul className="max-h-[28rem] divide-y divide-gray-100 overflow-y-auto text-sm">
                {liked.map((link) => {
                  const owner = link.listing ? likedPhones[link.listing.id] : undefined;
                  return (
                    <li key={link.id} className="space-y-0.5 py-2">
                      <div className="flex justify-between gap-2 text-xs">
                        <Link href={`/clients/${link.client.id}`} className="font-semibold text-gray-900 hover:underline">{link.client.name}</Link>
                        <span className="text-gray-400">{fmtDate(link.createdAt)}</span>
                      </div>
                      {link.listing ? (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                          <Link href={`/listings/${encodeURIComponent(link.listing.id)}`} className="text-emerald-700 hover:underline">{link.listing.title ?? link.listing.id}</Link>
                          <span className="text-gray-500">{link.listing.siteName}{link.listing.priceUsd ? ` · ${fmtMoney(link.listing.priceUsd)}` : ""}{link.listing.ownerName ? ` · ${link.listing.ownerName}` : ""}</span>
                          {owner ? <PhoneButton phone={owner.phone} /> : <span className="text-gray-400">ნომერი ჯერ არ გვაქვს</span>}
                        </div>
                      ) : (
                        <a href={link.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-amber-700 underline">ბაზაში ჯერ არ არის: {link.url}</a>
                      )}
                      {link.note ? <div className="text-xs text-gray-500">{link.note}</div> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title={`ჩვენებები (ბოლო ${days} დღე)`}>
            {viewings.length === 0 ? (
              <p className="text-sm text-gray-400">არ არის</p>
            ) : (
              <ul className="divide-y divide-gray-100 text-sm">
                {viewings.slice(0, 30).map((v) => (
                  <li key={v.id} className="py-1.5">
                    <div className="flex justify-between gap-2">
                      <span className="tabular-nums text-xs text-gray-500">{fmtDate(v.scheduledAt, true)}</span>
                      <span className="text-xs text-gray-600">{VIEWING_LABEL[v.status] ?? v.status}</span>
                    </div>
                    <div className="truncate text-gray-800">{v.client ? <Link href={`/clients/${v.client.id}`} className="hover:underline">{v.client.name}</Link> : "—"}{v.address ? ` · ${v.address}` : ""}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`საკუთარი პოსტები (${posts.length})`}>
            {posts.length === 0 ? (
              <p className="text-sm text-gray-400">არ არის</p>
            ) : (
              <ul className="divide-y divide-gray-100 text-sm">
                {posts.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2 py-1.5">
                    <Link href={`/shared/${p.id}`} className="min-w-0 truncate text-gray-900 hover:text-emerald-700">{p.title}</Link>
                    <span className="shrink-0 text-xs text-gray-500">{fmtDate(p.updatedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
