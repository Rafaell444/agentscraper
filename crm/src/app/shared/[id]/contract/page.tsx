import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { FEATURES, featureList, placeName, type Lang } from "@/lib/catalog";
import { leaseText, type LeaseData } from "@/lib/contract";
import { getSettings } from "@/lib/settings";
import { Card, PageHeader } from "@/components/ui";
import { PrintButton } from "./PrintButton";

// Lease agreement filled in from the listing and its client.  The form is a
// plain GET form, so the document below updates on "Fill in"; "Save as PDF"
// opens the browser's print dialog (Georgian fonts print correctly there).

export const dynamic = "force-dynamic";

type Search = Record<string, string | undefined>;
const LANGS: { value: string; label: string }[] = [
  { value: "ka", label: "ქართული" },
  { value: "en", label: "English" },
  { value: "ru", label: "Русский" },
  { value: "ka-en", label: "ქართული + English" },
  { value: "ka-ru", label: "ქართული + Русский" },
];

const today = () => new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 10);

export default async function ContractPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  await requireUser();
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const post = await prisma.sharedPost.findUnique({ where: { id }, include: { client: true } });
  if (!post) notFound();
  const settings = await getSettings();
  const clients = await prisma.client.findMany({ orderBy: { updatedAt: "desc" }, take: 200, select: { id: true, name: true, phone: true } });
  const chosen = q.clientId ? await prisma.client.findUnique({ where: { id: q.clientId } }) : post.client;

  const inventory = featureList(post.features)
    .filter((k) => ["furniture", "appliances", "washer", "dishwasher", "oven", "tv", "ac", "internet"].includes(k))
    .map((k) => FEATURES.find((f) => f.key === k)!);
  const langChoice = LANGS.some((l) => l.value === q.lang) ? q.lang! : "ka";
  const docLangs = (langChoice.includes("-") ? langChoice.split("-") : [langChoice]) as Lang[];
  // Picking another client refills the tenant fields.
  const clientChanged = q.prevClient !== undefined && (q.clientId ?? "") !== q.prevClient;
  if (clientChanged) {
    delete q.tenantName;
    delete q.tenantPhone;
    delete q.tenantId;
  }
  const v = (key: string, fallback: string | number | null | undefined = "") => (q[key] ?? (fallback == null ? "" : String(fallback))).slice(0, 200);

  const data: LeaseData = {
    number: v("number", post.refNo ? `${post.refNo}-${today().slice(2, 4)}` : ""),
    city: v("city", docLangs[0] === "ka" ? "თბილისი" : "Tbilisi"),
    date: v("date", today()),
    landlordName: v("landlordName", post.contactName),
    landlordId: v("landlordId"),
    landlordPhone: v("landlordPhone", post.contactPhone),
    tenantName: v("tenantName", chosen?.name),
    tenantId: v("tenantId"),
    tenantPhone: v("tenantPhone", chosen?.phone),
    address: v("address", post.location),
    area: v("area", post.area),
    rooms: v("rooms", post.rooms),
    start: v("start", chosen?.moveIn ? chosen.moveIn.toISOString().slice(0, 10) : today()),
    months: Math.max(0, Math.min(120, Number(v("months", chosen?.durationMonths ?? (post.leaseTerm?.match(/^(\d+)\+$/)?.[1] ?? 12))) || 0)),
    rent: v("rent", post.price),
    currency: ["USD", "GEL", "EUR"].includes(v("currency", post.currency)) ? v("currency", post.currency) : "USD",
    deposit: v("deposit", post.price),
    payDay: v("payDay", "5"),
    utilities: (["tenant", "landlord", "split"].includes(v("utilities")) ? v("utilities") : "tenant") as LeaseData["utilities"],
    pets: q.pets ? q.pets === "1" : post.pets === "yes",
    inventory: v("inventory", inventory.map((f) => f.ka).join(", ")),
    agency: settings.agency_name || "",
  };
  const texts = docLangs.map((l) => leaseText({ ...data, address: l === "ka" ? data.address : placeName(data.address, l), city: l === "ka" ? data.city : placeName(data.city, l), inventory: l === "ka" || !q.inventory ? (l === "ka" ? data.inventory : inventory.map((f) => f[l]).join(", ")) : data.inventory }, l));
  const field = "ui-field mt-1";

  return (
    <div className="space-y-4">
      {/* Print only the document: no CRM menu, no form. */}
      <style>{`@media print { body * { visibility: hidden !important; } #lease, #lease * { visibility: visible !important; } #lease { position: absolute; inset: 0 auto auto 0; width: 100%; box-shadow: none !important; border: 0 !important; padding: 0 !important; } @page { size: A4; margin: 16mm 14mm; } }`}</style>
      <PageHeader
        title="📄 ქირავნობის ხელშეკრულება"
        subtitle={<>{post.title}{post.refNo ? ` · #${post.refNo}` : ""}</>}
        actions={<Link href={`/shared/${post.id}`} className="ui-btn ui-btn-ghost ui-btn-sm">← პოსტზე</Link>}
      />

      <Card title="მონაცემები">
        <form className="space-y-3 text-sm" method="get">
          <input type="hidden" name="prevClient" value={chosen?.id ?? ""} />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs text-gray-600">ენა
              <select name="lang" defaultValue={langChoice} className={field}>{LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select>
            </label>
            <label className="block text-xs text-gray-600">კლიენტი (დამქირავებელი)
              <select name="clientId" defaultValue={chosen?.id ?? ""} className={field}>
                <option value="">—</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
              </select>
            </label>
            <label className="block text-xs text-gray-600">№<input name="number" defaultValue={data.number} className={field} /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs text-gray-600">გამქირავებელი (მესაკუთრე)<input name="landlordName" defaultValue={data.landlordName} className={field} /></label>
            <label className="block text-xs text-gray-600">მესაკუთრის პ/ნ<input name="landlordId" defaultValue={data.landlordId} className={field} inputMode="numeric" /></label>
            <label className="block text-xs text-gray-600">მესაკუთრის ტელეფონი<input name="landlordPhone" defaultValue={data.landlordPhone} className={field} /></label>
            <label className="block text-xs text-gray-600">დამქირავებელი<input name="tenantName" defaultValue={data.tenantName} className={field} /></label>
            <label className="block text-xs text-gray-600">დამქირავებლის პ/ნ ან პასპორტი<input name="tenantId" defaultValue={data.tenantId} className={field} /></label>
            <label className="block text-xs text-gray-600">დამქირავებლის ტელეფონი<input name="tenantPhone" defaultValue={data.tenantPhone} className={field} /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="block text-xs text-gray-600 sm:col-span-2">მისამართი<input name="address" defaultValue={data.address} className={field} /></label>
            <label className="block text-xs text-gray-600">ფართი, მ²<input name="area" defaultValue={data.area} className={field} /></label>
            <label className="block text-xs text-gray-600">ოთახები<input name="rooms" defaultValue={data.rooms} className={field} /></label>
            <label className="block text-xs text-gray-600">დაწყება<input type="date" name="start" defaultValue={data.start} className={field} /></label>
            <label className="block text-xs text-gray-600">ვადა, თვე<input name="months" defaultValue={data.months} className={field} inputMode="numeric" /></label>
            <label className="block text-xs text-gray-600">ქირა / თვე<input name="rent" defaultValue={data.rent} className={field} inputMode="decimal" /></label>
            <label className="block text-xs text-gray-600">ვალუტა
              <select name="currency" defaultValue={data.currency} className={field}><option>USD</option><option>GEL</option><option>EUR</option></select>
            </label>
            <label className="block text-xs text-gray-600">დეპოზიტი<input name="deposit" defaultValue={data.deposit} className={field} inputMode="decimal" /></label>
            <label className="block text-xs text-gray-600">გადახდის რიცხვი<input name="payDay" defaultValue={data.payDay} className={field} inputMode="numeric" /></label>
            <label className="block text-xs text-gray-600">კომუნალურები
              <select name="utilities" defaultValue={data.utilities} className={field}>
                <option value="tenant">იხდის დამქირავებელი</option>
                <option value="landlord">იხდის მესაკუთრე</option>
                <option value="split">მრიცხველები — დამქირ., კორპუსი — მესაკ.</option>
              </select>
            </label>
            <label className="block text-xs text-gray-600">ცხოველები
              <select name="pets" defaultValue={data.pets ? "1" : "0"} className={field}><option value="0">არა</option><option value="1">შეიძლება</option></select>
            </label>
            <label className="block text-xs text-gray-600">თარიღი<input type="date" name="date" defaultValue={data.date} className={field} /></label>
            <label className="block text-xs text-gray-600">ქალაქი<input name="city" defaultValue={data.city} className={field} /></label>
          </div>
          <label className="block text-xs text-gray-600">ინვენტარი (რა რჩება ბინაში)<input name="inventory" defaultValue={data.inventory} className={field} /></label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="ui-btn ui-btn-secondary">↻ შევსება</button>
            <PrintButton />
            <span className="text-xs text-gray-500">„PDF“ ხსნის ბეჭდვის ფანჯარას → აირჩიე „Save as PDF“ / „PDF-ად შენახვა“. ცარიელი ველი ხაზად იბეჭდება, ხელით შესავსებად.</span>
          </div>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">⚠️ ეს ზოგადი შაბლონია. პირველ გამოყენებამდე გადაახედე იურისტს და საჭიროებისამებრ შეცვალე პუნქტები.</p>
        </form>
      </Card>

      <article id="lease" className="mx-auto max-w-[210mm] rounded-xl border border-gray-200 bg-white p-8 text-[13px] leading-relaxed text-gray-900 shadow-sm">
        <div className={docLangs.length > 1 ? "grid grid-cols-2 gap-6" : ""}>
          {texts.map((text, i) => (
            <div key={docLangs[i]} lang={docLangs[i]}>
              <h1 className="mb-3 text-center text-lg font-bold uppercase tracking-wide">{text.title}</h1>
              <p className="mb-4 whitespace-pre-line">{text.intro}</p>
              {text.clauses.map((c) => (
                <section key={c.head} className="mb-3 break-inside-avoid">
                  <h2 className="font-bold">{c.head}</h2>
                  <p>{c.body}</p>
                </section>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-8 grid grid-cols-2 gap-8 break-inside-avoid">
          {(["landlord", "tenant"] as const).map((side) => (
            <div key={side} className="space-y-2">
              <div className="font-bold">{texts.map((t) => t[side]).join(" / ")}</div>
              <div>{side === "landlord" ? data.landlordName || "____________________" : data.tenantName || "____________________"}</div>
              <div>{texts[0].idLabel}: {(side === "landlord" ? data.landlordId : data.tenantId) || "____________"}</div>
              <div>{texts[0].phoneLabel}: {(side === "landlord" ? data.landlordPhone : data.tenantPhone) || "____________"}</div>
              <div className="pt-6">{texts.map((t) => t.signature).join(" / ")}: ______________________</div>
            </div>
          ))}
        </div>
        {data.agency ? <p className="mt-8 text-center text-[11px] text-gray-500">{data.agency}</p> : null}
      </article>
    </div>
  );
}
