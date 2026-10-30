import Link from "next/link";
import { AVAILABILITY, dealKind, headline, priceText } from "@/lib/catalog";
import { catalogStats } from "@/lib/catalogStats";
import { SOURCE_LABEL } from "@/lib/catalogEvents";
import { Card, EmptyState, StatCard } from "@/components/ui";
import { StackedBars } from "@/components/charts";

const PERIODS = [7, 30, 90];

function pct(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : "—";
}

/** The "📊 სტატისტიკა" tab of /channel. */
export async function CatalogStatsView({ days }: { days: number }) {
  const stats = await catalogStats(days);
  const { totals } = stats;
  const name = (postId: string) => {
    const p = stats.posts.get(postId);
    return p ? `#${p.refNo} ${headline(p, "ka")}` : "წაშლილი პოსტი";
  };
  const channels = stats.sources.filter((s) => s.source.startsWith("channel_"));
  const best = channels[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-600">პერიოდი:</span>
        {PERIODS.map((d) => (
          <Link key={d} href={`/channel?tab=stats&days=${d}`} className={`rounded-full px-3 py-1 font-semibold ${d === days ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
            {d} დღე
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="აპის გახსნა" value={totals.opens} hint="ვიზიტები" accent="blue" />
        <StatCard label="ბინის ნახვა" value={totals.views} />
        <StatCard label="შენახვა ♡" value={totals.saves} accent="rose" />
        <StatCard label="გაზიარება" value={totals.shares} accent="violet" />
        <StatCard label="მოთხოვნა" value={totals.leads} hint={`${pct(totals.leads, totals.views)} ნახვიდან`} accent="amber" />
      </div>

      <Card title="დღეების მიხედვით">
        <StackedBars data={stats.chart} keys={["ნახვა", "მოთხოვნა"]} colors={{ ნახვა: "#1d4f8c", მოთხოვნა: "#d97706" }} height={220} />
      </Card>

      <Card title="საიდან მოდიან კლიენტები">
        {stats.sources.length === 0 ? (
          <EmptyState title="მონაცემები ჯერ არ არის" hint="აპის ახალი ვიზიტები აქ დაითვლება — ძველი არხის პოსტებიც ითვლება" />
        ) : (
          <>
            {best && best.leads > 0 ? (
              <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                💡 ყველაზე მეტი მოთხოვნა მოვიდა აქედან: <b>{SOURCE_LABEL[best.source] ?? best.source}</b> ({best.leads}). ტოპ პოსტები ცხრილშია — მსგავსი ბინები უფრო ხშირად დადე.
              </p>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs text-gray-500">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">წყარო</th>
                    <th className="py-1.5 pr-3 text-right font-medium">გახსნა</th>
                    <th className="py-1.5 pr-3 text-right font-medium">ბინის ბმულზე დაჭერა</th>
                    <th className="py-1.5 pr-3 text-right font-medium">მოთხოვნა</th>
                    <th className="py-1.5 font-medium">ტოპ პოსტები (დაჭერით)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stats.sources.map((s) => (
                    <tr key={s.source} className="align-top">
                      <td className="py-2 pr-3 font-semibold text-gray-900">{SOURCE_LABEL[s.source] ?? (s.source === "unknown" ? "ძველი (წყაროს გარეშე)" : s.source)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{s.opens}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{s.flatClicks}</td>
                      <td className="py-2 pr-3 text-right font-semibold tabular-nums">{s.leads}</td>
                      <td className="py-2 text-xs">
                        {s.top.length ? (
                          <ul className="space-y-0.5">
                            {s.top.map((t) => (
                              <li key={t.postId}>
                                <Link href={`/shared/${t.postId}`} className="text-gray-700 hover:text-emerald-700">{name(t.postId)}</Link> <span className="text-gray-400">· {t.clicks}</span>
                              </li>
                            ))}
                          </ul>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Card title="ბინების მიხედვით">
        {stats.listings.length === 0 ? (
          <EmptyState title="ჯერ არაფერია" hint="როცა ხალხი აპში ბინებს გახსნის, აქ გამოჩნდება" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-gray-500">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">ბინა</th>
                  <th className="py-1.5 pr-3 text-right font-medium">👁 ნახვა</th>
                  <th className="py-1.5 pr-3 text-right font-medium">♡ შენახვა</th>
                  <th className="py-1.5 pr-3 text-right font-medium">↗ გაზიარება</th>
                  <th className="py-1.5 pr-3 text-right font-medium">📣 არხიდან</th>
                  <th className="py-1.5 pr-3 text-right font-medium">✉️ მოთხოვნა</th>
                  <th className="py-1.5 text-right font-medium">კონვერსია</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.listings.slice(0, 100).map((r) => {
                  const p = stats.posts.get(r.postId);
                  const a = p ? AVAILABILITY[p.availability] : null;
                  return (
                    <tr key={r.postId}>
                      <td className="py-2 pr-3">
                        <Link href={`/shared/${r.postId}`} className="font-medium text-gray-900 hover:text-emerald-700">{name(r.postId)}</Link>
                        {p ? <span className="ml-2 text-xs text-gray-500">{priceText(p.price, p.currency, dealKind(p.dealType), "ka")}</span> : null}
                        {a && p?.availability !== "available" ? <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${a.cls}`}>{a.label}</span> : null}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.views}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.saves}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.shares}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.clicks}</td>
                      <td className="py-2 pr-3 text-right font-semibold tabular-nums">{r.leads}</td>
                      <td className="py-2 text-right tabular-nums text-gray-600">{pct(r.leads, r.views)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] text-gray-500">„არხიდან“ — რამდენჯერ დააჭირეს ამ ბინის ბმულს Telegram არხში. ნახვები და შენახვები ითვლება ამ განახლებიდან; ძველი 👁 რიცხვი პოსტის გვერდზე რჩება.</p>
      </Card>
    </div>
  );
}
