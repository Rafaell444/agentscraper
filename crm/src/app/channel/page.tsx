import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { shareBase } from "@/lib/shareUrl";
import { fmtDate } from "@/lib/format";
import { AVAILABILITY, dealKind, headline, priceText } from "@/lib/catalog";
import { CHANNEL_FLAG, WELCOME_DEFAULTS, catalogLink, channelTargets, getWelcome, managerLink, mapLink } from "@/lib/channel";
import { botUsername, callVerbose } from "@/lib/telegram";
import { Card, EmptyState, PageHeader, Tabs } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";
import { SubmitButton } from "@/components/SubmitButton";
import { connectBot, postWelcome, setLeadStatus } from "./actions";
import { CatalogStatsView } from "./Stats";

export const dynamic = "force-dynamic";

const KIND = { viewing: "🗓 ჩვენება", question: "❓ კითხვა", search: "🔎 მომიძებნეთ" } as Record<string, string>;

function Step({ done, title, children }: { done: boolean; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${done ? "bg-emerald-600 text-white" : "bg-gray-200 text-gray-600"}`}>{done ? "✓" : "•"}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-gray-900">{title}</div>
        {children ? <div className="mt-0.5 text-xs text-gray-600">{children}</div> : null}
      </div>
    </li>
  );
}

export default async function ChannelPage({ searchParams }: { searchParams: Promise<{ bot?: string; tab?: string; welcome?: string; days?: string }> }) {
  const user = await requireUser();
  const { bot, tab = "leads", welcome, days } = await searchParams;
  const settings = await getSettings();
  const base = await shareBase(settings.public_base_url);
  const [username, hook, leads, posts, newLeads] = await Promise.all([
    botUsername(),
    callVerbose<{ url: string; last_error_message?: string }>("getWebhookInfo", {}),
    prisma.catalogLead.findMany({
      where: tab === "done" ? { status: "done" } : { status: "new" },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { post: { select: { id: true, refNo: true, propertyType: true, rooms: true, district: true, location: true } }, client: { select: { id: true, name: true } } },
    }),
    prisma.sharedPost.findMany({
      where: { OR: [{ catalog: true }, { channelMessageIds: { not: null } }] },
      orderBy: [{ availability: "asc" }, { updatedAt: "desc" }],
      take: 300,
      select: { id: true, refNo: true, catalog: true, propertyType: true, rooms: true, district: true, location: true, price: true, currency: true, dealType: true, availability: true, channelPostedAt: true, catalogViews: true, _count: { select: { catalogLeads: true, photos: true } } },
    }),
    prisma.catalogLead.count({ where: { status: "new" } }),
  ]);
  const channels = channelTargets(settings);
  const welcomes = await Promise.all(channels.map(async (c) => ({ ...c, post: await getWelcome(c.lang) })));
  const hookOk = hook.ok && hook.result.url === `${base}/api/telegram/webhook`;
  const appUrl = catalogLink(settings, base);
  const botMsg = bot ? { ok: bot === "ok", text: bot === "ok" ? "ბოტი დაკავშირდა: /start და მენიუს ღილაკი ახლა აპს ხსნის." : bot.slice(4) } : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Telegram არხი და აპი"
        subtitle="ჩვენი საჯარო კატალოგი: არხში პოსტები, Telegram-ის mini app ფილტრებით და რუკით, და კლიენტების მოთხოვნები პირდაპირ CRM-ში."
        actions={<a href="/catalog" target="_blank" rel="noreferrer" className="ui-btn ui-btn-secondary ui-btn-sm">აპის გახსნა ↗</a>}
      />

      {botMsg ? (
        <div className={`rounded-lg border p-3 text-sm font-medium ${botMsg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>{botMsg.ok ? "✅ " : "⚠️ "}{botMsg.text}</div>
      ) : null}

      <Card title="დაყენება (ერთხელ)">
        <ol className="space-y-3">
          <Step done={Boolean(username)} title={username ? `ბოტი: @${username}` : "ბოტი არ არის"}>
            {username ? "იგივე ბოტი, რომელიც შეტყობინებებს გზავნის." : "Vercel-ში დაამატე TELEGRAM_BOT_TOKEN (იხ. Telegram ტაბი)."}
          </Step>
          <Step done={channels.length > 0} title={channels.length ? `არხები: ${channels.map((c) => `${CHANNEL_FLAG[c.lang]} ${c.chat}`).join(" · ")}` : "შექმენი არხები (რუსული და ინგლისური)"}>
            თითო ენისთვის ცალკე: Telegram → New Channel → Public, მაგ. @tbilisi_rent_ru და @tbilisi_rent_en. თითოეულში არხის პარამეტრებში Administrators → Add Admin → @{username ?? "შენი_ბოტი"} („Post messages“, „Edit“, „Delete“ ჩართული). მერე <Link href="/settings" className="text-emerald-700 underline">პარამეტრებში</Link> შეავსე „🇷🇺 Telegram არხი“ და „🇬🇧 Telegram არხი“. ერთი ღილაკი ორივე არხში აქვეყნებს, თითოეულში თავის ენაზე.
          </Step>
          <Step done={hookOk} title="ბოტის დაკავშირება CRM-თან">
            {hook.ok && hook.result.last_error_message ? <span className="text-rose-700">ბოლო შეცდომა: {hook.result.last_error_message}. </span> : null}
            ბოტი პასუხობს /start-ს და ჩატის მენიუში ჩნდება ღილაკი „🏠 Catalog“.{" "}
            {user.role === "admin" ? (
              <form action={connectBot} className="mt-1.5">
                <SubmitButton pending="ერთდება…" className="ui-btn ui-btn-primary ui-btn-sm">{hookOk ? "თავიდან დაკავშირება" : "დაკავშირება"}</SubmitButton>
              </form>
            ) : " (ადმინი აკეთებს)"}
          </Step>
          <Step done={Boolean(settings.mini_app_link)} title="Mini App ბმული (სასურველი)">
            BotFather → /newapp → აირჩიე ბოტი → სახელი, აღწერა, ფოტო (640×360) → Web App URL: <code className="rounded bg-gray-100 px-1">{base}/catalog</code> → short name, მაგ. <code>app</code>. მიიღებ ბმულს https://t.me/{username ?? "bot"}/app — ჩასვი პარამეტრებში „Mini App ბმული“. ამის შემდეგ არხის პოსტის ბმულები აპს პირდაპირ Telegram-ში ხსნის.
          </Step>
          <Step done={Boolean(managerLink(settings.catalog_manager))} title="მენეჯერის Telegram">
            პარამეტრებში „მენეჯერის Telegram“ = @username — არხსა და აპში „მიწერე მენეჯერს“ მასთან მივა.
          </Step>
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 text-xs text-gray-600">
          აპის ბმული (არხის აღწერაში და მიმაგრებულ პოსტში ჩასასმელად):
          <code className="rounded bg-gray-100 px-1.5 py-0.5">{appUrl}</code>
          <CopyButton value={appUrl} className="ui-btn ui-btn-ghost ui-btn-sm" />
        </div>
      </Card>

      {user.role === "admin" && welcomes.length ? (
        <Card title="მისასალმებელი პოსტი „Open App“ ღილაკით">
          <div id="welcome" className="space-y-4">
            <p className="text-xs text-gray-600">
              Telegram-ში ხელით დაწერილ პოსტს ღილაკი ვერ ექნება — ღილაკიან პოსტს მხოლოდ ბოტი აქვეყნებს. აქედან ბოტი გამოაქვეყნებს პოსტს „🏠 Open App“ ღილაკით და მიამაგრებს; მიმაგრებულ ზოლზეც გამოჩნდება (Telegram ზოლზე ღილაკს მხოლოდ მაშინ აჩენს, როცა პოსტს ერთი ღილაკი აქვს). რუკის ბმული ტექსტში ჩასვი (ქვემოთ). ხელით დაწერილი ძველი პოსტი არხში წაშალე. **ტექსტი** = მუქი. შემდეგ ჯერზე იგივე პოსტი განახლდება (ახლის ნაცვლად), თუ „ახალი პოსტი“ არ მონიშნე.
            </p>
            {welcome ? (
              <div className={`rounded-lg border p-3 text-sm font-medium ${welcome.startsWith("ok:") ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
                {welcome.startsWith("ok:") ? "✅ " : "⚠️ "}{welcome.replace(/^(ok|err):/, "")}
              </div>
            ) : null}
            <div className="grid gap-4 lg:grid-cols-2">
              {welcomes.map((c) => {
                const defaults = WELCOME_DEFAULTS[c.lang === "ru" ? "ru" : "en"];
                return (
                  <form key={c.lang} action={postWelcome} className="space-y-2 rounded-lg border border-gray-200 p-3">
                    <input type="hidden" name="lang" value={c.lang} />
                    <div className="flex items-center justify-between text-sm font-semibold text-gray-900">
                      <span>{CHANNEL_FLAG[c.lang]} · {c.chat}</span>
                      <span className="text-xs font-normal text-gray-500">{c.post ? `გამოქვეყნებულია (#${c.post.id}${c.post.photo ? ", ფოტოთი" : ""})` : "ჯერ არ არის"}</span>
                    </div>
                    <textarea name="text" rows={12} defaultValue={c.post?.text ?? defaults.text} className="ui-field h-auto py-2 text-sm" />
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                      რუკის ბმული ტექსტისთვის:
                      <code className="break-all rounded bg-gray-100 px-1.5 py-0.5">{mapLink(settings, base, c.lang, "c")}</code>
                      <CopyButton value={mapLink(settings, base, c.lang, "c")} className="ui-btn ui-btn-ghost ui-btn-sm" />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="block text-xs text-gray-600">ღილაკის ტექსტი<input name="button" defaultValue={c.post?.button ?? defaults.button} className="ui-field mt-1" /></label>
                    </div>
                    <label className="block text-xs text-gray-600">ფოტო (ლოგო, არასავალდებულო; ტექსტი მაშინ ≤1024 სიმბოლო)<input type="file" name="photo" accept="image/jpeg,image/png" className="mt-1 block w-full text-xs" /></label>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-700">
                      <label className="flex items-center gap-1.5"><input type="checkbox" name="pin" value="1" defaultChecked /> მიმაგრება 📌</label>
                      {c.post ? <label className="flex items-center gap-1.5"><input type="checkbox" name="fresh" value="1" /> ახალი პოსტი (ძველის განახლების ნაცვლად)</label> : null}
                    </div>
                    <SubmitButton pending="იგზავნება…" className="ui-btn ui-btn-primary ui-btn-sm">{c.post ? "განახლება" : "გამოქვეყნება"} {CHANNEL_FLAG[c.lang]}</SubmitButton>
                  </form>
                );
              })}
            </div>
          </div>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          items={[{ value: "leads", label: "ახალი მოთხოვნები", count: newLeads }, { value: "done", label: "დამუშავებული" }, { value: "listings", label: `კატალოგი (${posts.length})` }, { value: "stats", label: "📊 სტატისტიკა" }]}
          current={tab}
          hrefFor={(value) => `/channel?tab=${value}`}
        />
      </div>

      {tab === "stats" ? (
        <CatalogStatsView days={[7, 30, 90].includes(Number(days)) ? Number(days) : 30} />
      ) : tab === "listings" ? (
        <Card title="კატალოგის ბინები">
          {posts.length === 0 ? (
            <EmptyState title="კატალოგი ცარიელია" hint="პოსტების ტაბში გახსენი პოსტი → „სად გამოვაქვეყნოთ“ → 📱 მინი აპი / 📣 Telegram / ორივეგან" />
          ) : (
            <ul className="divide-y divide-gray-100">
              {posts.map((p) => {
                const a = AVAILABILITY[p.availability] ?? AVAILABILITY.available;
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                    <span className="w-14 font-mono text-xs text-gray-500">#{p.refNo}</span>
                    <Link href={`/shared/${p.id}#catalog`} className="min-w-0 flex-1 font-medium text-gray-900 hover:text-emerald-700">{headline(p, "ka")}</Link>
                    <span className="text-gray-700">{priceText(p.price, p.currency, dealKind(p.dealType), "ka")}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${a.cls}`}>{a.label}</span>
                    <span className="text-xs text-gray-500">{p.catalog ? "📱 აპშია" : "📱 —"} · {p.channelPostedAt ? "📣 არხშია" : "📣 —"} · 👁 {p.catalogViews} · ✉️ {p._count.catalogLeads} · 📷 {p._count.photos}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : (
        <Card title={tab === "done" ? "დამუშავებული მოთხოვნები" : "ახალი მოთხოვნები აპიდან"}>
          {leads.length === 0 ? (
            <EmptyState title="მოთხოვნები არ არის" hint="როცა ვინმე აპში „ჩვენების მოთხოვნას“ ან „მომიძებნეთ“ გაგზავნის, აქ და Telegram-ში გამოჩნდება" />
          ) : (
            <ul className="divide-y divide-gray-100">
              {leads.map((lead) => (
                <li key={lead.id} className="flex flex-wrap items-start gap-3 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">{KIND[lead.kind] ?? lead.kind}</span>
                      {lead.alerts ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800" title="ბოტი ახალ შესაფერის ბინებს უგზავნის">🔔 შეტყობინებები{lead.alertedRefs ? ` · ${lead.alertedRefs.split(",").length} გაეგზავნა` : ""}</span> : null}
                      {lead.client ? <Link href={`/clients/${lead.client.id}`} className="font-semibold text-gray-900 hover:text-emerald-700">{lead.client.name}</Link> : <span className="font-semibold">{lead.name}</span>}
                      <span className="text-xs text-gray-500">{fmtDate(lead.createdAt, true)} · {lead.lang}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-3 text-xs">
                      {lead.tgUsername ? <a href={`https://t.me/${lead.tgUsername.slice(1)}`} target="_blank" rel="noreferrer" className="text-sky-700 underline">{lead.tgUsername}</a> : null}
                      {lead.phone ? <a href={`tel:${lead.phone}`} className="text-emerald-700 underline">{lead.phone}</a> : null}
                      {lead.post ? <Link href={`/shared/${lead.post.id}`} className="text-gray-600 underline">#{lead.post.refNo} {headline(lead.post, "ka")}</Link> : null}
                    </div>
                    {lead.message ? <p className="mt-1 whitespace-pre-line text-xs text-gray-700">{lead.message}</p> : null}
                  </div>
                  <form action={setLeadStatus}>
                    <input type="hidden" name="id" value={lead.id} />
                    <input type="hidden" name="status" value={lead.status === "done" ? "new" : "done"} />
                    <SubmitButton pending="…" className="ui-btn ui-btn-secondary ui-btn-sm">{lead.status === "done" ? "დაბრუნება" : "✓ დამუშავდა"}</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
