import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { shareBase } from "@/lib/shareUrl";
import { phoneQueueSize } from "@/lib/ext";
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
  const [mine, all, waiting] = await Promise.all([
    prisma.activity.count({ where: { userId: session.id, type: "phone", detail: { endsWith: "(extension)" }, createdAt: { gte: since } } }),
    prisma.activity.count({ where: { type: "phone", detail: { endsWith: "(extension)" } } }),
    phoneQueueSize(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="🧩 Chrome გაფართოება" subtitle="შენი Chrome-იდან: MyHome-ის ნომრები და დაბლოკილი საიტების (ss.ge, binebi) ახალი განცხადებები — პირდაპირ CRM-ში." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="ნომერი დღეს (შენ)" value={mine} />
        <StatCard label="სულ გაფართოებით" value={all} accent="blue" />
        <StatCard label="რიგში (ნომრის გარეშე)" value={waiting} accent="amber" />
      </div>

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
          <li><b>ავტომატური რეჟიმი</b> — ჩართულია თავიდანვე (გამორთვა ფანჯარაშია). ის ფონურ ჩანართში ხსნის CRM-ის რიგიდან MyHome-ის განცხადებებს (ჯერ მესაკუთრეები, ახლები პირველად), აჭერს „ნომრის ნახვა“-ს და ნომერს CRM-ში წერს. ტემპი: ~1 განცხადება წუთში, დღეში მაქსიმუმ 400 (ფანჯარაში იცვლება). Chrome უნდა იყოს ჩართული.</li>
          <li><b>დაბლოკილი საიტები (ss.ge, binebi)</b> — ისინი GitHub-ის სერვერს ბლოკავენ, ამიტომ გაფართოება მათ გვერდებს შენი Chrome-იდან ჩამოტვირთავს: Chrome-ის გახსნისას და ყოველ 30 წუთში. CRM მერე მაშინვე უშვებს შემგროვებელს — ახალი განცხადებები და ss.ge-ის ნომრებიც მოდის. Chrome დახურული ფანჯრებითაც მუშაობს ფონში (თუ კომპიუტერი ჩართულია); ღამის განცხადებები დილით, Chrome-ის გახსნისას ჩამოვა.</li>
          <li><b>ერთი დაჭერით</b> — MyHome-ის ნებისმიერ განცხადებაზე ჩნდება ღილაკი „📞 → CRM“. ნომერი იხსნება და ჩაიწერება.</li>
          <li>თუ MyHome შესვლას ან შემოწმებას მოითხოვს, ავტომატური რეჟიმი თავისით ჩერდება — გაიარე შემოწმება ჩვეულებრივ და ისევ ჩართე.</li>
          <li>ნომერი ჩანს განცხადების გვერდზე („ხელით ნაპოვნი ნომერი“) და ისტორიაში „(extension)“ ნიშნით.</li>
        </ul>
      </Card>
    </div>
  );
}
