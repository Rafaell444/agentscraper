import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { filterOptions, listListings, readFilters, type SearchParams } from "@/lib/queries";
import { fmtDate, fmtMoney, fmtNum } from "@/lib/format";
import { EmptyState, LinkButton, PageHeader, PhoneButton, PosterBadge, SiteBadge, StatusBadge } from "@/components/ui";
import { FilterBar } from "@/components/FilterBar";

export const dynamic = "force-dynamic";

function withParams(base: Record<string, string>, extra: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...base, ...extra })) if (value) params.set(key, value);
  return `/listings?${params.toString()}`;
}

export default async function ListingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const filters = readFilters(await searchParams);
  const [options, result] = await Promise.all([filterOptions(filters.who), listListings(filters)]);
  const base = Object.fromEntries(Object.entries(filters).filter(([key]) => key !== "page")) as Record<string, string>;
  const copiesBadge = (key: string | null) => {
    const count = key ? result.copyCounts[key] ?? 0 : 0;
    if (count < 2) return null;
    return (
      <Link
        href={`/listings?who=all&key=${encodeURIComponent(key!)}`}
        title="იგივე ობიექტი სხვა საიტზე ან სხვა განმთავსებლისგან"
        className="inline-flex items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-200"
      >
        ×{count}
      </Link>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <>
            განცხადებები <span className="text-base font-normal text-gray-400">{result.total.toLocaleString("en-US")}</span>
          </>
        }
        subtitle="თბილისი · ახალი განცხადებები · ფილტრები მყისიერად მოქმედებს"
        actions={
          <LinkButton href={withParams(base, {}).replace("/listings?", "/api/export?")} external>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v3h16v-3" />
            </svg>
            CSV ექსპორტი
          </LinkButton>
        }
      />

      <FilterBar filters={filters} options={options} userId={user.id} total={result.total} />

      {/* Phones and small tablets: one card per listing */}
      <ul className="space-y-2 md:hidden">
        {result.items.map((listing) => (
          <li key={listing.id} className={`ui-card p-3 ${listing.archived ? "opacity-60" : ""}`}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <SiteBadge site={listing.site} name={listing.siteName} />
                <PosterBadge kind={listing.posterKind} ownerType={listing.ownerType} />
                {copiesBadge(listing.propertyKey)}
                <StatusBadge status={listing.lead?.status} />
              </div>
              <span className="text-xs text-gray-500">{fmtDate(listing.collectedAt, true)}</span>
            </div>
            <Link href={`/listings/${listing.id}`} className="block font-semibold text-gray-900">
              {listing.title ?? listing.propertyId}
            </Link>
            <div className="text-xs text-gray-500">{[listing.neighbourhood ?? listing.district, listing.address].filter(Boolean).join(" · ")}</div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="text-base font-bold text-emerald-700">{fmtMoney(listing.priceUsd)}</span>
              {listing.pricePerM2Usd ? <span className="text-gray-500">{fmtNum(listing.pricePerM2Usd)} $/მ²</span> : null}
              {listing.rooms ? <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{listing.rooms} ოთ.</span> : null}
              {listing.areaM2 ? <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{fmtNum(listing.areaM2)} მ²</span> : null}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-gray-600">
                {listing.ownerName ?? ""}
                {listing.lead?.assignedTo?.name ? <span className="text-gray-400"> · {listing.lead.assignedTo.name}</span> : null}
              </span>
              <PhoneButton phone={listing.phone || listing.lead?.manualPhone} />
            </div>
          </li>
        ))}
        {result.items.length === 0 ? (
          <li className="ui-card">
            <EmptyState title="განცხადებები ვერ მოიძებნა" hint="შეცვალეთ ან გაასუფთავეთ ფილტრები" />
          </li>
        ) : null}
      </ul>

      <div className="ui-card hidden overflow-hidden md:block">
        <div className="max-h-[70vh] overflow-auto">
          <table className="ui-table w-full min-w-[1080px] text-sm">
            <thead>
              <tr>
                <th>დამატებულია</th>
                <th>საიტი</th>
                <th>განცხადება</th>
                <th>უბანი</th>
                <th className="text-right">ოთ. / მ²</th>
                <th className="text-right">ფასი</th>
                <th>მესაკუთრე</th>
                <th>სტატუსი</th>
                <th>აგენტი</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {result.items.map((listing) => (
                <tr key={listing.id} className={listing.archived ? "opacity-60" : ""}>
                  <td className="whitespace-nowrap text-xs text-gray-500">{fmtDate(listing.collectedAt, true)}</td>
                  <td>
                    <div className="flex flex-col items-start gap-1">
                      <SiteBadge site={listing.site} name={listing.siteName} />
                      <span className="flex items-center gap-1">
                        <PosterBadge kind={listing.posterKind} ownerType={listing.ownerType} />
                        {copiesBadge(listing.propertyKey)}
                      </span>
                    </div>
                  </td>
                  <td className="max-w-[340px]">
                    <Link href={`/listings/${listing.id}`} className="block truncate font-semibold text-gray-900 hover:text-emerald-700">
                      {listing.title ?? listing.propertyId}
                    </Link>
                    <div className="truncate text-xs text-gray-500">{[listing.dealType, listing.propertyType, listing.address].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td>
                    <div className="whitespace-nowrap">{listing.neighbourhood ?? ""}</div>
                    <div className="whitespace-nowrap text-xs text-gray-500">{listing.district ?? ""}</div>
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    <div>{listing.rooms ? `${listing.rooms} ოთ.` : "—"}</div>
                    <div className="text-xs text-gray-500">{listing.areaM2 ? `${fmtNum(listing.areaM2)} მ²` : ""}</div>
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    <div className="font-semibold text-gray-900">{fmtMoney(listing.priceUsd)}</div>
                    <div className="text-xs text-gray-500">{listing.pricePerM2Usd ? `${fmtNum(listing.pricePerM2Usd)} $/მ²` : ""}</div>
                  </td>
                  <td>
                    <div className="truncate text-gray-700">{listing.ownerName ?? ""}</div>
                    <PhoneButton phone={listing.phone || listing.lead?.manualPhone} />
                  </td>
                  <td>
                    <StatusBadge status={listing.lead?.status} />
                  </td>
                  <td className="whitespace-nowrap text-gray-600">{listing.lead?.assignedTo?.name ?? <span className="text-gray-300">—</span>}</td>
                  <td className="text-right">
                    <Link href={`/listings/${listing.id}`} className="ui-btn ui-btn-ghost ui-btn-sm" aria-label="გახსნა">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </Link>
                  </td>
                </tr>
              ))}
              {result.items.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <EmptyState title="განცხადებები ვერ მოიძებნა" hint="შეცვალეთ ან გაასუფთავეთ ფილტრები" />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>
          გვერდი {result.page} / {result.pages}
        </span>
        <div className="flex gap-2">
          {result.page > 1 ? (
            <LinkButton href={withParams(base, { page: String(result.page - 1) })} size="sm">
              ← წინა
            </LinkButton>
          ) : null}
          {result.page < result.pages ? (
            <LinkButton href={withParams(base, { page: String(result.page + 1) })} size="sm">
              შემდეგი →
            </LinkButton>
          ) : null}
        </div>
      </div>
    </div>
  );
}
