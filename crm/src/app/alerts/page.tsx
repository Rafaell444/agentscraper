import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { filterOptions } from "@/lib/queries";
import { csv, ruleSummary, ruleWhere } from "@/lib/alerts";
import { botToken, botUsername } from "@/lib/telegram";
import { daysAgo, fmtDate } from "@/lib/format";
import { Button, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";
import { SubmitButton } from "@/components/SubmitButton";
import { addRecipient, checkRecipients, deleteRecipient, deleteRule, testRecipient, toggleRule } from "./actions";
import { RuleForm } from "./RuleForm";

export const dynamic = "force-dynamic";

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ saved?: string; linked?: string; test?: string }> }) {
  await requireUser();
  const { saved, linked, test } = await searchParams;
  const [rules, recipients, options, bot] = await Promise.all([
    prisma.alertRule.findMany({ orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } } } }),
    prisma.telegramRecipient.findMany({ orderBy: { createdAt: "asc" } }),
    filterOptions(""),
    botToken() ? botUsername() : Promise.resolve(null),
  ]);
  const weekAgo = daysAgo(7);
  const weekCounts = await Promise.all(rules.map((rule) => prisma.listing.count({ where: { AND: [ruleWhere(rule), { collectedAt: { gte: weekAgo } }] } })));
  const recipientName = new Map(recipients.map((r) => [r.id, r.name]));

  return (
    <div className="space-y-4">
      <PageHeader title="Telegram შეტყობინებები" subtitle="შექმენი ფილტრი — როცა კოლექტორი იპოვის შესაფერის ახალ განცხადებას, Telegram-ზე მაშინვე მოგივა (კოლექტორი ყოველ 30 წუთში მუშაობს)." />

      {saved ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-900">✅ ფილტრი შენახულია.</div> : null}
      {linked !== undefined ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          {Number(linked) > 0 ? `✅ დაკავშირდა ${linked} ტელეფონი.` : "ახალი დაკავშირება ვერ ვიპოვე. ტელეფონზე გახსენი ბმული, დააჭირე Start-ს და მერე ისევ „შემოწმება“."}
        </div>
      ) : null}
      {test ? (
        <div className={`rounded-lg border p-3 text-sm ${test === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
          {test === "ok" ? "✅ სატესტო შეტყობინება გაიგზავნა." : "შეტყობინება ვერ გაიგზავნა. შეამოწმე, რომ ტელეფონი დაკავშირებულია და ბოტი არ არის დაბლოკილი."}
        </div>
      ) : null}

      {!bot ? (
        <Card title="ბოტი ჯერ არ არის ჩართული">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-700">
            <li>Telegram-ში გახსენი <b>@BotFather</b>, დაწერე <code>/newbot</code> და მიჰყევი ინსტრუქციას. ბოლოს მოგცემს ტოკენს.</li>
            <li>Vercel → პროექტი → Settings → Environment Variables: დაამატე <code>TELEGRAM_BOT_TOKEN</code> = ტოკენი, მერე Redeploy.</li>
            <li>GitHub → agentscraper → Settings → Secrets and variables → Actions: დაამატე იგივე <code>TELEGRAM_BOT_TOKEN</code> (შეტყობინებებს კოლექტორი აგზავნის).</li>
          </ol>
        </Card>
      ) : null}

      <Card
        title="Telegram მიმღებები"
        action={bot ? (
          <form action={checkRecipients}>
            <SubmitButton pending="მოწმდება…" className="ui-btn ui-btn-secondary ui-btn-sm">შემოწმება</SubmitButton>
          </form>
        ) : null}
      >
        <p className="mb-3 text-xs text-gray-500">
          Telegram ნომერზე პირდაპირ ვერ წერს, ამიტომ თითო ტელეფონი ერთხელ უკავშირდება ბოტს: დაამატე მიმღები, გახსენი მისი ბმული იმ ტელეფონზე, დააჭირე <b>Start</b>, მერე აქ „შემოწმება“.
        </p>
        {recipients.length ? (
          <ul className="divide-y divide-gray-100">
            {recipients.map((r) => {
              const link = bot ? `https://t.me/${bot}?start=${r.connectCode}` : "";
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="min-w-0 flex-1 text-sm font-medium text-gray-900">{r.name}</span>
                  {r.chatId ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">დაკავშირებულია</span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">ელოდება Start-ს</span>
                  )}
                  {link && !r.chatId ? (
                    <>
                      <a href={link} target="_blank" rel="noreferrer" className="ui-btn ui-btn-primary ui-btn-sm">გახსნა Telegram-ში</a>
                      <CopyButton value={link} />
                    </>
                  ) : null}
                  {r.chatId ? (
                    <form action={testRecipient}>
                      <input type="hidden" name="id" value={r.id} />
                      <SubmitButton pending="…" className="ui-btn ui-btn-secondary ui-btn-sm">ტესტი</SubmitButton>
                    </form>
                  ) : null}
                  <form action={deleteRecipient}>
                    <input type="hidden" name="id" value={r.id} />
                    <SubmitButton pending="…" className="ui-btn ui-btn-ghost ui-btn-sm" confirm={`წავშალო ${r.name}?`}>✕</SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        ) : null}
        <form action={addRecipient} className="mt-3 flex gap-2">
          <Input name="name" placeholder="მაგ. ნინო — 599 12 34 56" className="flex-1" />
          <Button type="submit" size="sm">დამატება</Button>
        </form>
      </Card>

      <Card title={`ფილტრები (${rules.length})`}>
        {rules.length === 0 ? (
          <EmptyState title="ფილტრები ჯერ არ არის" hint="შექმენი ქვემოთ" />
        ) : (
          <ul className="divide-y divide-gray-100">
            {rules.map((rule, index) => (
              <li key={rule.id} className={`flex flex-wrap items-start gap-3 py-3 ${rule.active ? "" : "opacity-60"}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/alerts/${rule.id}`} className="text-sm font-semibold text-gray-900 hover:text-emerald-700">{rule.name}</Link>
                    {!rule.active ? <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-600">გათიშულია</span> : null}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-600">{ruleSummary(rule)}</p>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    → {csv(rule.recipientIds).map((id) => recipientName.get(id)).filter(Boolean).join(", ") || <span className="text-rose-600">მიმღები არ არის არჩეული</span>}
                    {" · "}ბოლო 7 დღეში {weekCounts[index]} შესაფერისი · გაგზავნილი {rule.sentCount}{rule.lastSentAt ? ` (ბოლოს ${fmtDate(rule.lastSentAt, true)})` : ""} · {rule.createdBy.name}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Link href={`/alerts/${rule.id}`} className="ui-btn ui-btn-secondary ui-btn-sm">რედაქტირება</Link>
                  <form action={toggleRule}>
                    <input type="hidden" name="id" value={rule.id} />
                    <SubmitButton pending="…" className="ui-btn ui-btn-ghost ui-btn-sm">{rule.active ? "გათიშვა" : "ჩართვა"}</SubmitButton>
                  </form>
                  <form action={deleteRule}>
                    <input type="hidden" name="id" value={rule.id} />
                    <SubmitButton pending="…" className="ui-btn ui-btn-ghost ui-btn-sm" confirm={`წავშალო ფილტრი „${rule.name}“?`}>✕</SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="ახალი ფილტრი">
        <RuleForm options={options} recipients={recipients} />
      </Card>
    </div>
  );
}
