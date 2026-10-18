import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtDate } from "@/lib/format";
import { POST_STATUS, intlPhone } from "@/lib/sharedPosts";
import { shareBase, shareLink } from "@/lib/shareUrl";
import { Button, Card, Input, PageHeader, Select } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";
import { SubmitButton } from "@/components/SubmitButton";
import { deletePost, regenerateToken, setPostStatus, updatePost } from "../actions";
import { PhotoManager } from "./PhotoManager";

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

export default async function SharedPostEditor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notfound?: string }> }) {
  await requireUser();
  const { id } = await params;
  const { notfound } = await searchParams;
  const [post, clients, settings] = await Promise.all([
    prisma.sharedPost.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, phone: true, messenger: true } },
        createdBy: { select: { name: true } },
        photos: { orderBy: [{ position: "asc" }, { id: "asc" }], select: { id: true } },
      },
    }),
    prisma.client.findMany({ where: { status: { notIn: ["closed_won", "closed_lost"] } }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 300 }),
    getSettings(),
  ]);
  if (!post) notFound();
  const link = shareLink(await shareBase(settings.public_base_url), post.token);
  const st = POST_STATUS[post.status] ?? POST_STATUS.draft;
  const message = `${GREETING[post.lang] ?? GREETING.ka} ${link}`;
  const clientPhone = intlPhone(post.client?.messenger || post.client?.phone);
  const waUrl = `https://wa.me/${clientPhone}?text=${encodeURIComponent(message)}`;
  const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(GREETING[post.lang] ?? GREETING.ka)}`;
  const published = post.status === "published";

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
          </>
        }
      />

      {notfound ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          ამ ბმულიდან მონაცემები ვერ წამოვიღე (საიტმა დაბლოკა ან განცხადება ჩვენს ბაზაში ჯერ არ არის). შეავსე ველები ხელით და ატვირთე ფოტოები ტელეფონიდან.
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

      <form action={updatePost} className="space-y-4">
        <input type="hidden" name="id" value={post.id} />
        <Card title="ტექსტი და პარამეტრები">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="სათაური" wide>
              <Input name="title" defaultValue={post.title} required />
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
              <Input name="contactPhone" defaultValue={post.contactPhone ?? ""} inputMode="tel" placeholder="599 12 34 56" required />
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

        <div className="flex flex-wrap gap-2">
          <SubmitButton pending="ინახება…" className="ui-btn ui-btn-secondary">შენახვა</SubmitButton>
          <SubmitButton pending="ინახება…" name="publish" value="1">{published ? "შენახვა (გამოქვეყნებულზე)" : "შენახვა და გამოქვეყნება"}</SubmitButton>
        </div>
      </form>

      <Card title={`ფოტოები (${post.photos.length})`}>
        <PhotoManager postId={post.id} token={post.token} photoIds={post.photos.map((p) => p.id)} />
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
            <SubmitButton pending="იშლება…" className="ui-btn ui-btn-danger ui-btn-sm" confirm="წავშალო პოსტი და მისი ფოტოები? ბმული აღარ იმუშავებს.">წაშლა</SubmitButton>
          </form>
        </div>
        <p className="mt-2 text-[11px] text-gray-500">ორიგინალის ბმული მხოლოდ CRM-ში ჩანს, კლიენტის გვერდზე — არა.</p>
      </Card>

      <datalist id="deal-types">{DEALS.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="property-types">{TYPES.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="conditions">{CONDITIONS.map((v) => <option key={v} value={v} />)}</datalist>
    </div>
  );
}
