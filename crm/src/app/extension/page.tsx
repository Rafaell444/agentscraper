import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { shareBase } from "@/lib/shareUrl";
import { phoneQueueSize } from "@/lib/ext";
import { paceAnalytics } from "@/lib/extPace";
import { Card, PageHeader, StatCard } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";
import { SubmitButton } from "@/components/SubmitButton";
import { rotateExtToken } from "./actions";

// Setup page for the Chrome extension that reads MyHome owner numbers.

export const dynamic = "force-dynamic";

export default async function ExtensionPage() {
  const session = await requireUser();
  const [user, settings] = await Promise.all([prisma.user.findUnique({ where: { id: session.id }, select: { extToken: true } }), getSettings()]);
  const base = await shareBase(settings.public_base_url);
  const since = new Date(Date.now() - 24 * 3600_000);
  const [mine, all, waiting, pace] = await Promise.all([
    prisma.activity.count({ where: { userId: session.id, type: "phone", detail: { endsWith: "(extension)" }, createdAt: { gte: since } } }),
    prisma.activity.count({ where: { type: "phone", detail: { endsWith: "(extension)" } } }),
    phoneQueueSize(),
    paceAnalytics(),
  ]);
  const paceLabel = (s: number) => (s >= 60 ? `${s / 60} წთ` : `${s} წმ`);

  return (
    <div className="space-y-4">
      <PageHeader title="🧩 Chrome გაფართოება" subtitle="შენი Chrome-იდან: MyHome-ის ნომრები და დაბლოკილი საიტების (ss.ge, binebi) ახალი განცხადებები — პირდაპირ CRM-ში." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="ნომერი დღეს (შენ)" value={mine} />
        <StatCard label="სულ გაფართოებით" value={all} accent="blue" />
        <StatCard label="რიგში (ნომრის გარეშე)" value={waiting} accent="amber" />
      </div>

      <Card title="📊 პაუზის ანალიტიკა (ბოლო 30 დღე)">
        {pace.rows.length ? (
          <div className="space-y-3 text-sm">
            <p className={pace.safest ? "font-semibold text-emerald-700" : "text-gray-700"}>
              {pace.safest
                ? `✓ ყველაზე მოკლე უსაფრთხო პაუზა ჯერჯერობით: ${paceLabel(pace.safest)} — 150+ განცხადება ისე, რომ MyHome-მა არ გამოგვიყვანა.`
                : "ჯერ საკმარისი მონაცემი არ არის — უსაფრთხოდ ითვლება პაუზა, რომელზეც 150+ განცხადება გაიარა გამოყვანის გარეშე."}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-xs text-gray-500">
                  <tr>
                    <th className="py-1.5 pr-3">პაუზა</th>
                    <th className="py-1.5 pr-3">განცხადება</th>
                    <th className="py-1.5 pr-3">ნომერი</th>
                    <th className="py-1.5 pr-3">საათი</th>
                    <th className="py-1.5 pr-3">გამოყვანა</th>
                    <th className="py-1.5">ერთ გამოყვანაზე</th>
                  </tr>
                </thead>
                <tbody>
                  {pace.rows.map((row) => (
                    <tr key={row.pace} className={`border-t border-gray-100 ${row.pace === pace.safest ? "bg-emerald-50" : ""}`}>
                      <td className="py-1.5 pr-3 font-semibold">{paceLabel(row.pace)}</td>
                      <td className="py-1.5 pr-3">{row.tried}</td>
                      <td className="py-1.5 pr-3">{row.found}</td>
                      <td className="py-1.5 pr-3">{row.hours.toFixed(1)}</td>
                      <td className={`py-1.5 pr-3 ${row.logouts ? "font-semibold text-red-700" : "text-emerald-700"}`}>{row.logouts ? `⚠ ${row.logouts}` : "✓ 0"}</td>
                      <td className="py-1.5 text-gray-500">{row.perLogout ? `~${row.perLogout} განცხ.` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500">
              გამოყვანის შემდეგ გაფართოება პაუზას ზრდის; 300 განცხადება გამოყვანის გარეშე — ერთი საფეხურით ამცირებს (მაგრამ არა იმ პაუზამდე, რომელმაც ბოლო 3 დღეში გამოგვიყვანა).
              {pace.lastLogout ? ` ბოლო გამოყვანა: ${paceLabel(pace.lastLogout.pace)} პაუზაზე, ${pace.lastLogout.at.toLocaleString("ka-GE", { timeZone: "Asia/Tbilisi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.` : ""}
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">ჯერ მონაცემი არ არის — გაფართოება 1.8.0+ ყოველი გაშვების შემდეგ აქ აგზავნის, რამდენი განცხადება გაიარა რა პაუზით და გამოგვიყვანა თუ არა MyHome-მა.</p>
        )}
      </Card>

      <Card title="1. ჩამოტვირთე და დააყენე">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-gray-700">
          <li>
            ჩამოტვირთე: <a href="/tbilisi-home-extension.zip" download className="font-semibold text-emerald-700 underline">tbilisi-home-extension.zip</a> და გახსენი (Extract) ნებისმიერ საქაღალდეში.
          </li>
          <li>Chrome-ში გახსენი <code className="rounded bg-gray-100 px-1">chrome://extensions</code> → ზედა მარჯვენა კუთხეში ჩართე <b>Developer mode</b>.</li>
          <li><b>Load unpacked</b> → აირჩიე გახსნილი საქაღალდე <code className="rounded bg-gray-100 px-1">tbilisi-home-extension</code>.</li>
          <li>დაამაგრე (📌) გაფართოების ხატულა ზედა ზოლზე.</li>
        </ol>
      </Card>

      <Card title="2. დააკავშირე CRM-თან">
        <div className="space-y-3 text-sm">
          <p className="text-gray-700">გაფართოების ფანჯარაში ჩასვი ეს ორი მნიშვნელობა და დააჭირე „დაკავშირება“:</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 text-gray-500">CRM მისამართი</span>
            <code className="rounded bg-gray-100 px-2 py-1">{base}</code>
            <CopyButton value={base} className="ui-btn ui-btn-ghost ui-btn-sm" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 text-gray-500">შენი გასაღები</span>
            {user?.extToken ? (
              <>
                <code className="max-w-full break-all rounded bg-gray-100 px-2 py-1 text-xs">{user.extToken}</code>
                <CopyButton value={user.extToken} className="ui-btn ui-btn-ghost ui-btn-sm" />
              </>
            ) : (
              <span className="text-gray-500">ჯერ არ არის</span>
            )}
          </div>
          <form action={rotateExtToken}>
            <SubmitButton pending="…" className="ui-btn ui-btn-secondary ui-btn-sm">{user?.extToken ? "↻ ახალი გასაღები (ძველი აღარ იმუშავებს)" : "🔑 გასაღების შექმნა"}</SubmitButton>
          </form>
          <p className="text-xs text-gray-500">გასაღები პირადია: ვისაც აქვს, შეუძლია შენი სახელით ნომრები ჩაწეროს. არავის გაუზიარო.</p>
        </div>
      </Card>

      <Card title="3. როგორ მუშაობს">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-gray-700">
          <li><b>ავტომატური რეჟიმი</b> — ჩართულია თავიდანვე (გამორთვა ფანჯარაშია). ის ფონურ ჩანართში ხსნის CRM-ის რიგიდან MyHome-ის განცხადებებს (ჯერ მესაკუთრეები, ახლები პირველად), აჭერს „ნომრის ნახვა“-ს და ნომერს CRM-ში წერს. პაუზა განცხადებებს შორის: 20 წამიდან, თავად ერგება MyHome-ს (იხ. ანალიტიკა ზემოთ); დღეში მაქსიმუმ 1500. Chrome უნდა იყოს ჩართული.</li>
          <li><b>დაბლოკილი საიტები (ss.ge, binebi)</b> — ისინი GitHub-ის სერვერს ბლოკავენ, ამიტომ გაფართოება მათ გვერდებს შენი Chrome-იდან ჩამოტვირთავს: Chrome-ის გახსნისას და ყოველ 30 წუთში. CRM მერე მაშინვე უშვებს შემგროვებელს — ახალი განცხადებები და ss.ge-ის ნომრებიც მოდის. Chrome დახურული ფანჯრებითაც მუშაობს ფონში (თუ კომპიუტერი ჩართულია); ღამის განცხადებები დილით, Chrome-ის გახსნისას ჩამოვა.</li>
          <li><b>ერთი დაჭერით</b> — MyHome-ის ნებისმიერ განცხადებაზე ჩნდება ღილაკი „📞 → CRM“. ნომერი იხსნება და ჩაიწერება.</li>
          <li>თუ MyHome შესვლას ან შემოწმებას მოითხოვს, ავტომატური რეჟიმი თავისით ჩერდება, იხსნება წითელი გვერდი და მოდის Telegram შეტყობინება — შედი MyHome-ზე და დააჭირე „ისევ ჩართვა“.</li>
          <li>ნომერი ჩანს განცხადების გვერდზე („ხელით ნაპოვნი ნომერი“) და ისტორიაში „(extension)“ ნიშნით.</li>
        </ul>
      </Card>
    </div>
  );
}
