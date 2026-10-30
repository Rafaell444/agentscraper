import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtDate } from "@/lib/format";
import { fmtTbilisi, lastScheduleRun, toTbilisiInput } from "@/lib/schedule";
import { POST_STATUS, intlPhone } from "@/lib/sharedPosts";
import { shareBase, shareLink } from "@/lib/shareUrl";
import { mapView } from "@/lib/map";
import { Button, Card, Input, PageHeader, Select } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";
import { SubmitButton } from "@/components/SubmitButton";
import { deletePost, regenerateToken, retryCollectorFetch, saveToApp, saveToBoth, savePostAndPublish, saveToTelegram, setPostStatus, updatePost } from "../actions";
import { PhotoManager } from "./PhotoManager";
import { filterOptions } from "@/lib/queries";
import { AVAILABILITY, FEATURES, LEASE_TERMS, featureList, termText } from "@/lib/catalog";
import { CHANNEL_FLAG, catalogLink, channelTargets, parseChannelIds } from "@/lib/channel";
import { setAvailability, showInApp, takeOffApp, takeOffBoth, takeOffChannel } from "@/app/channel/actions";
import { ImportWaiter } from "./ImportWaiter";

export const dynamic = "force-dynamic";

const DEALS = ["ქირავდება", "იყიდება", "ქირავდება დღიურად", "გირავდება"];
const TYPES = ["ბინა", "კერძო სახლი", "აგარაკი", "მიწის ნაკვეთი", "კომერციული ფართი", "სასტუმრო"];
const CONDITIONS = ["ახალი გარემონტებული", "ძველი გარემონტებული", "მიმდინარე რემონტი", "სარემონტო", "თეთრი კარკასი", "შავი კარკასი", "მწვანე კარკასი"];
const GREETING: Record<string, string> = {
  ka: "გამარჯობა! გიგზავნით ბინის დეტალებს:",
  en: "Hello! Here are the details of the apartment:",
  ru: "Здравствуйте! Вот детали квартиры:",
};

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? "sm:col-span-2 lg:col-span-3" : ""}`}>
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {children}
    </label>
  );
}

export default async function SharedPostEditor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notfound?: string; saved?: string; map?: string; channel?: string }> }) {
  await requireUser();
  const { id } = await params;
  const { notfound, saved, map, channel } = await searchParams;
  const [post, clients, settings, options] = await Promise.all([
    prisma.sharedPost.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, phone: true, messenger: true } },
        createdBy: { select: { name: true } },
        photos: { orderBy: [{ position: "asc" }, { id: "asc" }], select: { id: true, kind: true } },
      },
    }),
    prisma.client.findMany({ where: { status: { notIn: ["closed_won", "closed_lost"] } }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 300 }),
    getSettings(),
    filterOptions(""),
  ]);
  if (!post) notFound();
  const lastRun = await lastScheduleRun();
  // The publisher normally runs every ~10 minutes; over an hour means it is not set up or stopped.
  const schedulerOk = Boolean(lastRun && Date.now() - lastRun.getTime() < 3600_000);
  const link = shareLink(await shareBase(settings.public_base_url), post.token);
  const st = POST_STATUS[post.status] ?? POST_STATUS.draft;
  const message = `${GREETING[post.lang] ?? GREETING.ka} ${link}`;
  const clientPhone = intlPhone(post.client?.messenger || post.client?.phone);
  const waUrl = `https://wa.me/${clientPhone}?text=${encodeURIComponent(message)}`;
  const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(GREETING[post.lang] ?? GREETING.ka)}`;
  const published = post.status === "published";
  // The agent sees what the client will see (area only / exact).
  const base = await shareBase(settings.public_base_url);
  const catalogUrl = post.refNo ? catalogLink(settings, base, post.refNo) : null;
  const channels = channelTargets(settings);
  const postedIn = parseChannelIds(post.channelMessageIds);
  const missing = channels.filter((c) => !postedIn[c.lang]);
  const postFeatures = new Set(featureList(post.features));
  const channelMsg = channel ? { ok: channel.startsWith("ok:"), text: channel.replace(/^(ok|err):/, "") } : null;
  const mapPreview = mapView(post.lat, post.lng, post.mapMode === "off" ? "exact" : post.mapMode);

  return (
    <div className="space-y-4">
      <PageHeader
        title={post.title}
        subtitle={
          <>
            <span className={`mr-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
            {post.createdBy.name} · {fmtDate(post.createdAt, true)} · ნახვები: {post.views}
            {post.lastViewedAt ? ` (ბოლო: ${fmtDate(post.lastViewedAt, true)})` : ""}
          </>
        }
        actions={
          <>
            <Link href="/shared" className="ui-btn ui-btn-ghost ui-btn-sm">← ყველა პოსტი</Link>
            <a href={`/s/${post.token}`} target="_blank" rel="noreferrer" className="ui-btn ui-btn-secondary ui-btn-sm">გადახედვა ↗</a>
            <Link href={`/shared/${post.id}/contract`} className="ui-btn ui-btn-secondary ui-btn-sm">📄 ხელშეკრულება</Link>
            {post.refNo && post.catalog ? <a href={`/flat/${post.refNo}`} target="_blank" rel="noreferrer" className="ui-btn ui-btn-ghost ui-btn-sm">🌐 საიტზე ↗</a> : null}
          </>
        }
      />

      {saved ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-900">
          {saved === "published" ? "✅ შენახულია და გამოქვეყნებულია — ბმული ქვემოთაა, დააკოპირე და გაუგზავნე კლიენტს." : "✅ შენახულია."}
        </div>
      ) : null}

      {channelMsg ? (
        <div className={`rounded-lg border p-3 text-sm font-medium ${channelMsg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
          {channelMsg.ok ? "✅ " : "⚠️ "}
          {channelMsg.text}
        </div>
      ) : null}

      {post.importState === "waiting" ? <ImportWaiter postId={post.id} /> : null}
      {post.importState === "failed" ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <span className="flex-1">MyHome-დან ჩატვირთვა ვერ მოხერხდა. სცადე თავიდან, ან შეავსე ველები ხელით და ატვირთე ფოტოები.</span>
          <form action={retryCollectorFetch}>
            <input type="hidden" name="id" value={post.id} />
            <SubmitButton pending="იგზავნება…" className="ui-btn ui-btn-secondary ui-btn-sm">თავიდან ცდა</SubmitButton>
          </form>
        </div>
      ) : null}

      {notfound ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          ამ ბმულიდან მონაცემები ვერ წამოვიღე (საიტმა დაბლოკა ან განცხადება ჩვენს ბაზაში ჯერ არ არის). შეავსე ველები ხელით და ატვირთე ფოტოები ტელეფონიდან. MyHome-ის ავტომატური ჩატვირთვისთვის ადმინმა Vercel-ში უნდა დაამატოს GITHUB_DISPATCH_TOKEN.
        </div>
      ) : null}

      <Card title={published ? "✅ გამოქვეყნებულია — გაუგზავნე კლიენტს" : "კლიენტი ამ პოსტს ჯერ ვერ ხედავს"}>
        {published ? (
          <div className="space-y-2">
            <input readOnly value={link} className="ui-field font-mono text-xs" />
            <div className="flex flex-wrap gap-2">
              <CopyButton value={link} className="ui-btn ui-btn-primary ui-btn-sm" />
              <a href={waUrl} target="_blank" rel="noreferrer" className="ui-btn ui-btn-sm bg-green-500 text-white hover:bg-green-600">
                WhatsApp{post.client ? ` → ${post.client.name}` : ""}
              </a>
              <a href={tgUrl} target="_blank" rel="noreferrer" className="ui-btn ui-btn-secondary ui-btn-sm">Telegram</a>
              <form action={setPostStatus}>
                <input type="hidden" name="id" value={post.id} />
                <input type="hidden" name="status" value="draft" />
                <Button variant="ghost" size="sm" type="submit">დამალვა (მონახაზში დაბრუნება)</Button>
              </form>
            </div>
            <p className="text-xs text-gray-500">ბმული საიდუმლოა: კლიენტი ხედავს მხოლოდ ამ ერთ განცხადებას. CRM-ის სხვა გვერდები მისთვის დაკეტილია.</p>
          </div>
        ) : (
          <p className="text-sm text-gray-600">
            შეამოწმე ტექსტი, ფასი, ნომერი და ფოტოები, შემდეგ დააჭირე <b>„შენახვა და გამოქვეყნება“</b>. მანამდე ბმული კლიენტისთვის არ მუშაობს (შენ CRM-ში შესული ხარ, ამიტომ „გადახედვა“ გიჩვენებს).
          </p>
        )}
      </Card>

      <form action={updatePost} noValidate className="space-y-4">
        <input type="hidden" name="id" value={post.id} />
        <Card title="ტექსტი და პარამეტრები">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="სათაური" wide>
              <Input name="title" defaultValue={post.title} />
            </Field>
            <Field label="გარიგება">
              <Input name="dealType" defaultValue={post.dealType ?? ""} list="deal-types" />
            </Field>
            <Field label="ქონების ტიპი">
              <Input name="propertyType" defaultValue={post.propertyType ?? ""} list="property-types" />
            </Field>
            <Field label="მდებარეობა (რაც კლიენტს უნდა ეჩვენოს)">
              <Input name="location" defaultValue={post.location ?? ""} placeholder="მაგ. ვაკე, თბილისი" />
            </Field>
            <Field label="ფასი">
              <div className="flex gap-2">
                <Input name="price" defaultValue={post.price ?? ""} inputMode="decimal" className="flex-1" />
                <Select name="currency" defaultValue={post.currency} className="w-20">
                  <option value="USD">$</option>
                  <option value="GEL">₾</option>
                </Select>
              </div>
            </Field>
            <Field label="ფართი, მ²">
              <Input name="area" defaultValue={post.area ?? ""} inputMode="decimal" />
            </Field>
            <Field label="მდგომარეობა">
              <Input name="condition" defaultValue={post.condition ?? ""} list="conditions" />
            </Field>
            <Field label="ოთახები">
              <Input name="rooms" defaultValue={post.rooms ?? ""} inputMode="numeric" />
            </Field>
            <Field label="საძინებელი">
              <Input name="bedrooms" defaultValue={post.bedrooms ?? ""} inputMode="numeric" />
            </Field>
            <Field label="სველი წერტილი">
              <Input name="bathrooms" defaultValue={post.bathrooms ?? ""} inputMode="numeric" />
            </Field>
            <Field label="სართული">
              <Input name="floor" defaultValue={post.floor ?? ""} inputMode="numeric" />
            </Field>
            <Field label="სართულები სულ">
              <Input name="totalFloors" defaultValue={post.totalFloors ?? ""} inputMode="numeric" />
            </Field>
            <Field label="აღწერა" wide>
              <textarea name="description" defaultValue={post.description ?? ""} rows={7} className="ui-field" />
              <span className="mt-1 block text-[11px] text-gray-500">შემოტანისას მესაკუთრის ნომრები ტექსტში შენი ნომრით შეიცვალა — მაინც გადაამოწმე, რომ მესაკუთრის სახელი, ნომერი ან ზუსტი მისამართი არ დარჩეს.</span>
            </Field>
          </div>
        </Card>

        <Card title="კონტაქტი, კლიენტი, ენა">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="შენი სახელი (ჩანს პოსტზე)">
              <Input name="contactName" defaultValue={post.contactName ?? ""} placeholder="მაგ. ნინო — აგენტი" />
            </Field>
            <Field label="შენი ნომერი (ჩანს პოსტზე)">
              <Input name="contactPhone" defaultValue={post.contactPhone ?? ""} inputMode="tel" placeholder="599 12 34 56" />
            </Field>
            <Field label="კლიენტი">
              <Select name="clientId" defaultValue={post.clientId ?? ""}>
                <option value="">— არცერთი —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="გვერდის ენა (ღილაკები და წარწერები)">
              <Select name="lang" defaultValue={post.lang}>
                <option value="ka">ქართული</option>
                <option value="en">English</option>
                <option value="ru">Русский</option>
              </Select>
            </Field>
          </div>
        </Card>

        <Card title="რუკა">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Google Maps ბმული ან კოორდინატები">
              <Input name="mapInput" defaultValue={post.lat != null && post.lng != null ? `${post.lat}, ${post.lng}` : ""} placeholder="https://maps.app.goo.gl/...  ან  41.7167, 44.7453" autoComplete="off" />
            </Field>
            <Field label="კლიენტს რუკაზე უჩვენე">
              <Select name="mapMode" defaultValue={post.mapMode}>
                <option value="approx">მხოლოდ უბანი (ზუსტი წერტილის გარეშე)</option>
                <option value="exact">ზუსტი მდებარეობა</option>
                <option value="off">რუკა არ აჩვენო</option>
              </Select>
            </Field>
          </div>
          {map === "bad" ? <p className="mt-2 text-xs font-medium text-rose-700">ეს ბმული ვერ წავიკითხე. Google Maps-ში დააჭირე წერტილს და დააკოპირე კოორდინატები (მაგ. 41.7167, 44.7453), ან გაზიარების ბმული.</p> : null}
          {mapPreview ? (
            <iframe title="map" src={mapPreview.embedUrl} className="mt-3 h-64 w-full rounded-lg border border-gray-200" loading="lazy" referrerPolicy="no-referrer" />
          ) : (
            <p className="mt-2 text-xs text-gray-500">
              binebi.ge-დან რუკა თავად შემოდის. MyHome-ზე გახსენი ორიგინალი, რუკაზე დააჭირე „Google Maps“ / წერტილს, დააკოპირე ბმული ან კოორდინატები და ჩასვი აქ.
              {post.sourceUrl ? <> <a href={post.sourceUrl} target="_blank" rel="noreferrer" className="text-emerald-700 underline">ორიგინალის გახსნა ↗</a></> : null}
            </p>
          )}
        </Card>


        <div id="catalog" className="scroll-mt-20">
          <Card title="კატალოგი (Telegram აპი და არხი)">
            <p className="mb-3 text-xs text-gray-600">
              ეს ველები მინი აპისა და Telegram არხისთვისაა. „შენახვა“ მხოლოდ ინახავს — აპში ან არხში ქვემოთ, „სად გამოვაქვეყნოთ“ ღილაკებით დადე. {post.refNo ? <span className="font-mono text-gray-500">#{post.refNo}</span> : null}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="უბანი (ფილტრისთვის)">
                <Input name="district" defaultValue={post.district ?? ""} list="catalog-districts" placeholder="მაგ. ვაკე" />
              </Field>
              <Field label="შინაური ცხოველები">
                <Select name="pets" defaultValue={post.pets ?? ""}>
                  <option value="">— არ ვუთითებთ —</option>
                  <option value="yes">შეიძლება</option>
                  <option value="ask">შეთანხმებით</option>
                  <option value="no">არა</option>
                </Select>
              </Field>
              <Field label="ქირის ვადა">
                <Select name="leaseTerm" defaultValue={post.leaseTerm ?? ""}>
                  <option value="">— არ ვუთითებთ —</option>
                  {LEASE_TERMS.map((term) => <option key={term} value={term}>{termText(term, "ka")}</option>)}
                  {post.leaseTerm && !LEASE_TERMS.includes(post.leaseTerm) ? <option value={post.leaseTerm}>{post.leaseTerm}</option> : null}
                </Select>
              </Field>
            </div>
            <div className="mt-3">
              <span className="mb-1 block text-xs font-medium text-gray-600">რა აქვს</span>
              <div className="flex flex-wrap gap-1.5">
                {FEATURES.map((f) => (
                  <label key={f.key} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-sm has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50 has-[:checked]:text-emerald-800">
                    <input type="checkbox" name="features" value={f.key} defaultChecked={postFeatures.has(f.key)} className="accent-emerald-600" />
                    {f.emoji} {f.ka}
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <Field label="აღწერა ინგლისურად (უცხოელებისთვის)">
                <textarea name="descriptionEn" defaultValue={post.descriptionEn ?? ""} rows={5} className="ui-field" />
              </Field>
              <Field label="აღწერა რუსულად">
                <textarea name="descriptionRu" defaultValue={post.descriptionRu ?? ""} rows={5} className="ui-field" />
              </Field>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <Field label="🎬 ვიდეო (YouTube / Shorts ან .mp4 ბმული)">
                <Input name="videoUrl" defaultValue={post.videoUrl ?? ""} placeholder="https://youtube.com/shorts/..." inputMode="url" />
              </Field>
              <Field label="🧭 3D ტური (Matterport, Kuula…)">
                <Input name="tourUrl" defaultValue={post.tourUrl ?? ""} placeholder="https://my.matterport.com/show/?m=..." inputMode="url" />
              </Field>
            </div>
            <p className="mt-2 text-[11px] text-gray-500">აპი კლიენტს აჩვენებს მის ენაზე: ინგლისური/რუსული აღწერა თუ ცარიელია, ქართული გამოჩნდება. სათაური ავტომატურად იწერება სამივე ენაზე (ტიპი, ოთახები, უბანი). მისამართი („მდებარეობა“) და რუკა კატალოგშიც ზემოთ არჩეული წესით ჩანს.</p>
          </Card>
        </div>

        <Card title="სად გამოვაქვეყნოთ">
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className={`rounded-full px-2.5 py-1 ${post.catalog ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-500"}`}>📱 მინი აპი: {post.catalog ? "ჩანს" : "არ ჩანს"}</span>
            <span className={`rounded-full px-2.5 py-1 ${post.channelMessageIds ? "bg-sky-100 text-sky-800" : "bg-gray-100 text-gray-500"}`}>📣 Telegram: {post.channelMessageIds ? (Object.keys(postedIn) as (keyof typeof CHANNEL_FLAG)[]).map((l) => CHANNEL_FLAG[l]).join(", ") : "არ არის"}</span>
            {post.scheduleAppAt ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">⏰ 📱 აპში: {fmtTbilisi(post.scheduleAppAt)}</span> : null}
            {post.scheduleTgAt ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">⏰ 📣 Telegram-ში: {fmtTbilisi(post.scheduleTgAt)}</span> : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <SubmitButton pending="ინახება…" formAction={saveToApp} className="ui-btn ui-btn-secondary">{post.catalog ? "📱 შენახვა (აპშია)" : "📱 მინი აპში დამატება"}</SubmitButton>
            <SubmitButton pending="იგზავნება…" formAction={saveToTelegram} className="ui-btn ui-btn-secondary">{!post.channelMessageIds ? `📣 Telegram-ში: ${channels.map((c) => CHANNEL_FLAG[c.lang]).join(" + ") || "არხი"}` : missing.length ? `📣 დამატება: ${missing.map((c) => CHANNEL_FLAG[c.lang]).join(" + ")}` : "📣 არხის პოსტის განახლება"}</SubmitButton>
            {!post.catalog || missing.length ? <SubmitButton pending="ქვეყნდება…" formAction={saveToBoth}>📱 + 📣 ორივეგან</SubmitButton> : null}
          </div>
          <p className="mt-2 text-[11px] text-gray-500">ღილაკი ჯერ ინახავს ცვლილებებს. თითო არხში მიდის პირველი 10 ფოტო და ტექსტი იმ არხის ენაზე. მხოლოდ არხში დადებულ პოსტს „დეტალები აპში“ ბმული არ ექნება.</p>
          <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-3">
            <div className="mb-2 text-sm font-semibold text-gray-900">⏰ ავტომატური გამოქვეყნება <span className="font-normal text-gray-500">(თბილისის დროით)</span></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-gray-600">
                📱 მინი აპში
                <input type="datetime-local" name="scheduleAppAt" defaultValue={toTbilisiInput(post.scheduleAppAt)} disabled={post.catalog && !post.scheduleAppAt} className="ui-field mt-1 disabled:opacity-50" />
                {post.catalog && !post.scheduleAppAt ? <span className="mt-1 block text-[11px] font-normal text-gray-500">უკვე აპშია</span> : null}
              </label>
              <label className="block text-xs font-medium text-gray-600">
                📣 Telegram არხებში ({channels.map((c) => CHANNEL_FLAG[c.lang]).join(" + ") || "არხი არ არის"})
                <input type="datetime-local" name="scheduleTgAt" defaultValue={toTbilisiInput(post.scheduleTgAt)} className="ui-field mt-1" />
              </label>
            </div>
            <p className="mt-2 text-[11px] text-gray-500">
              შეავსე დრო და დააჭირე „შენახვა“ — დრო რომ მოვა, ბინა თავად გამოჩნდება აპში / დაიდება არხებში და ზარში შეტყობინება მოგივა. ცარიელი = არ იგეგმება (გასაუქმებლად წაშალე დრო და შეინახე). მოწმდება ~10 წუთში ერთხელ{lastRun ? `, ბოლოს: ${fmtTbilisi(lastRun)}` : ""}.
            </p>
            {!schedulerOk ? <p className="mt-1 text-[11px] font-medium text-amber-700">⚠️ ავტომატური შემმოწმებელი ჯერ არ გაშვებულა ან 1 საათზე მეტია არ გაეშვა (GitHub → Actions → „Publish scheduled posts“).</p> : null}
          </div>
          {post.lat == null || post.mapMode === "off" ? <p className="mt-2 text-xs font-medium text-amber-700">⚠️ რუკის წერტილი არ არის — აპის რუკაზე ეს ბინა არ გამოჩნდება. ზემოთ „რუკა“ ველში ჩასვი Google Maps ბმული ან კოორდინატები.</p> : null}
        </Card>

        <div className="flex flex-wrap gap-2">
          <SubmitButton pending="ინახება…" className="ui-btn ui-btn-secondary">შენახვა</SubmitButton>
          <SubmitButton pending="ქვეყნდება…" formAction={savePostAndPublish}>{published ? "შენახვა (გამოქვეყნებულზე)" : "შენახვა და გამოქვეყნება"}</SubmitButton>
        </div>
      </form>


      {post.catalog || post.channelMessageIds || post.refNo ? (
        <Card title="აპი და Telegram — მართვა">
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-gray-600">სტატუსი:</span>
              {Object.entries(AVAILABILITY).map(([value, a]) => (
                <form key={value} action={setAvailability}>
                  <input type="hidden" name="id" value={post.id} />
                  <input type="hidden" name="availability" value={value} />
                  <button type="submit" className={`rounded-full px-2.5 py-1 text-xs font-semibold ${post.availability === value ? `${a.cls} ring-2 ring-offset-1 ring-emerald-500` : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{a.label}</button>
                </form>
              ))}
            </div>
            <p className="text-xs text-gray-500">„გაქირავდა“ / „გაიყიდა“ — ბინა აპში 30 დღე რჩება ნიშნით „გაქირავდა/გაიყიდა“ (მოთხოვნის ღილაკის გარეშე, აჩვენებს რომ საქმეს ვხურავთ), მერე ქრება. არხის პოსტზე თავში ეწერება 🔴 სტატუსი.</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-gray-200 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-semibold">📱 მინი აპი</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${post.catalog ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}`}>{post.catalog ? "ჩანს" : "დამალულია"}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {post.catalog ? (
                    <form action={takeOffApp}>
                      <input type="hidden" name="id" value={post.id} />
                      <SubmitButton pending="…" className="ui-btn ui-btn-secondary ui-btn-sm">🙈 აპიდან დამალვა</SubmitButton>
                    </form>
                  ) : (
                    <form action={showInApp}>
                      <input type="hidden" name="id" value={post.id} />
                      <SubmitButton pending="…" className="ui-btn ui-btn-primary ui-btn-sm">👁 აპში დაბრუნება</SubmitButton>
                    </form>
                  )}
                  {catalogUrl && post.catalog ? <a href={catalogUrl} target="_blank" rel="noreferrer" className="ui-btn ui-btn-ghost ui-btn-sm">აპში ნახვა ↗</a> : null}
                  {catalogUrl && post.catalog ? <CopyButton value={catalogUrl} className="ui-btn ui-btn-ghost ui-btn-sm" /> : null}
                </div>
                <p className="mt-2 text-[11px] text-gray-500">დამალვა არაფერს შლის: ნომერი, ფოტოები და ტექსტი რჩება, ერთი ღილაკით ბრუნდება.</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-semibold">📣 Telegram არხები</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${post.channelMessageIds ? "bg-sky-100 text-sky-800" : "bg-gray-100 text-gray-600"}`}>{post.channelMessageIds ? (Object.keys(postedIn) as (keyof typeof CHANNEL_FLAG)[]).map((l) => CHANNEL_FLAG[l]).join(", ") : "არ არის"}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(Object.keys(postedIn) as (keyof typeof CHANNEL_FLAG)[]).map((l) => (
                    <form key={l} action={takeOffChannel}>
                      <input type="hidden" name="id" value={post.id} />
                      <input type="hidden" name="lang" value={l} />
                      <SubmitButton pending="იშლება…" className="ui-btn ui-btn-secondary ui-btn-sm" confirm={`წავშალო ${CHANNEL_FLAG[l]} არხიდან?`}>🗑 {CHANNEL_FLAG[l]}</SubmitButton>
                    </form>
                  ))}
                  {Object.keys(postedIn).length > 1 ? (
                    <form action={takeOffChannel}>
                      <input type="hidden" name="id" value={post.id} />
                      <SubmitButton pending="იშლება…" className="ui-btn ui-btn-secondary ui-btn-sm" confirm="წავშალო ყველა არხიდან?">🗑 ყველა არხიდან</SubmitButton>
                    </form>
                  ) : null}
                  {!post.channelMessageIds ? <span className="text-xs text-gray-500">გამოსაქვეყნებლად — „სად გამოვაქვეყნოთ“ ზემოთ</span> : null}
                </div>
                <p className="mt-2 text-[11px] text-gray-500">Telegram-ში პოსტის დამალვა შეუძლებელია, მხოლოდ წაშლა. დროებით — სტატუსი „დაჯავშნილია“ / „გაქირავდა“ (პოსტს თავში 🟡/🔴 ეწერება).</p>
              </div>
            </div>
            {post.catalog && post.channelMessageIds ? (
              <form action={takeOffBoth}>
                <input type="hidden" name="id" value={post.id} />
                <SubmitButton pending="…" className="ui-btn ui-btn-secondary ui-btn-sm" confirm="დავმალო აპიდან და წავშალო ყველა არხიდან?">🙈 + 🗑 ორივედან მოხსნა (აპიდან დამალვა და არხებიდან წაშლა)</SubmitButton>
              </form>
            ) : null}
            <p className="text-xs text-gray-500">
              {post.channelPostedAt ? `არხებშია: ${(Object.keys(postedIn) as (keyof typeof CHANNEL_FLAG)[]).map((l) => CHANNEL_FLAG[l]).join(", ")} · ${fmtDate(post.channelPostedAt, true)} · ` : ""}აპში ნახვები: {post.catalogViews}. სტატუსის შეცვლა არხის პოსტსაც ანახლებს.
            </p>
          </div>
        </Card>
      ) : null}

      <Card title={`ფოტოები (${post.photos.length})`}>
        <PhotoManager postId={post.id} token={post.token} photoIds={post.photos.map((p) => p.id)} planIds={post.photos.filter((p) => p.kind === "plan").map((p) => p.id)} />
      </Card>

      <Card title="სხვა">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {post.sourceUrl ? (
            <a href={post.sourceUrl} target="_blank" rel="noreferrer" className="ui-btn ui-btn-ghost ui-btn-sm">ორიგინალი განცხადება ↗</a>
          ) : null}
          <form action={setPostStatus}>
            <input type="hidden" name="id" value={post.id} />
            <input type="hidden" name="status" value={post.status === "archived" ? "draft" : "archived"} />
            <Button variant="secondary" size="sm" type="submit">{post.status === "archived" ? "არქივიდან დაბრუნება" : "არქივში გადატანა (ბმული გაითიშება)"}</Button>
          </form>
          <form action={regenerateToken}>
            <input type="hidden" name="id" value={post.id} />
            <Button variant="secondary" size="sm" type="submit">ახალი ბმული (ძველი გაითიშება)</Button>
          </form>
          <form action={deletePost}>
            <input type="hidden" name="id" value={post.id} />
            <SubmitButton pending="იშლება…" className="ui-btn ui-btn-danger ui-btn-sm" confirm="სამუდამოდ წავშალო? ქრება CRM-იდან, მინი აპიდან და Telegram არხებიდან, ფოტოებიც. დაბრუნება შეუძლებელია.">🗑 სამუდამოდ წაშლა (ყველგან)</SubmitButton>
          </form>
        </div>
        <p className="mt-2 text-[11px] text-gray-500">ორიგინალის ბმული მხოლოდ CRM-ში ჩანს, კლიენტის გვერდზე — არა.</p>
      </Card>

      <datalist id="deal-types">{DEALS.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="property-types">{TYPES.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="catalog-districts">{options.districts.map((d) => <option key={d.name} value={d.name} />)}</datalist>
      <datalist id="conditions">{CONDITIONS.map((v) => <option key={v} value={v} />)}</datalist>
    </div>
  );
}
