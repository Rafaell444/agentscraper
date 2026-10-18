import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtMoney, fmtNum } from "@/lib/format";
import { intlPhone } from "@/lib/sharedPosts";
import { EN_CONDITION, EN_DEAL, EN_TYPE, RU_CONDITION, RU_DEAL, RU_TYPE, en } from "@/lib/segments";

export const dynamic = "force-dynamic";

// Private page: not indexed, and the source address never leaks via Referer.
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer", title: "Apartment" };

const LABELS = {
  ka: { area: "ფართი", rooms: "ოთახი", bedrooms: "საძინებელი", bathrooms: "სველი წერტილი", floor: "სართული", condition: "მდგომარეობა", month: "/ თვე", day: "/ დღე", call: "დარეკვა", whatsapp: "WhatsApp", contact: "საკონტაქტო პირი", description: "აღწერა", draft: "მონახაზი — კლიენტი ამ გვერდს ჯერ ვერ ხედავს", hello: "გამარჯობა! მაინტერესებს ეს ბინა:" },
  en: { area: "Area", rooms: "Rooms", bedrooms: "Bedrooms", bathrooms: "Bathrooms", floor: "Floor", condition: "Condition", month: "/ month", day: "/ day", call: "Call", whatsapp: "WhatsApp", contact: "Contact", description: "Description", draft: "Draft — the client cannot see this page yet", hello: "Hello! I'm interested in this apartment:" },
  ru: { area: "Площадь", rooms: "Комнат", bedrooms: "Спален", bathrooms: "Санузлов", floor: "Этаж", condition: "Состояние", month: "/ мес.", day: "/ сутки", call: "Позвонить", whatsapp: "WhatsApp", contact: "Контакт", description: "Описание", draft: "Черновик — клиент пока не видит эту страницу", hello: "Здравствуйте! Меня интересует эта квартира:" },
} as const;

/** The page a client opens from a private link: one listing, our agent's contact, nothing else. */
export default async function SharedPostPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) notFound();
  const post = await prisma.sharedPost.findUnique({
    where: { token },
    include: { photos: { orderBy: [{ position: "asc" }, { id: "asc" }], select: { id: true } } },
  });
  if (!post) notFound();
  const session = await getSession();
  if (post.status !== "published" && !session) notFound();
  if (!session) {
    await prisma.sharedPost.update({ where: { id: post.id }, data: { views: { increment: 1 }, lastViewedAt: new Date() } }).catch(() => null);
  }
  const settings = await getSettings();
  const lang = post.lang === "en" || post.lang === "ru" ? post.lang : "ka";
  const t = LABELS[lang];
  const maps = lang === "en" ? { deal: EN_DEAL, type: EN_TYPE, cond: EN_CONDITION } : lang === "ru" ? { deal: RU_DEAL, type: RU_TYPE, cond: RU_CONDITION } : { deal: {}, type: {}, cond: {} };
  const perUnit = post.dealType?.includes("დღიურად") ? t.day : post.dealType === "ქირავდება" ? t.month : "";
  const phone = intlPhone(post.contactPhone);
  const wa = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(`${t.hello} ${post.title}`)}` : "";
  const facts: [string, string][] = [
    [t.area, post.area ? `${fmtNum(post.area)} m²` : ""],
    [t.rooms, post.rooms ? String(post.rooms) : ""],
    [t.bedrooms, post.bedrooms ? String(post.bedrooms) : ""],
    [t.bathrooms, post.bathrooms ? String(post.bathrooms) : ""],
    [t.floor, post.floor != null ? `${post.floor}${post.totalFloors ? ` / ${post.totalFloors}` : ""}` : ""],
    [t.condition, en(maps.cond, post.condition)],
  ];
  const kind = [en(maps.deal, post.dealType), en(maps.type, post.propertyType)].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-3xl">
      {post.status !== "published" ? (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-900">{t.draft}</div>
      ) : null}
      {settings.agency_name ? <div className="mb-3 text-xs font-medium text-gray-500">{settings.agency_name}</div> : null}
      <div className="ui-card overflow-hidden">
        {post.photos.length ? (
          <div className="flex snap-x snap-mandatory overflow-x-auto bg-gray-900">
            {post.photos.map((photo, index) => (
              <div key={photo.id} className="relative w-full shrink-0 snap-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/s/${post.token}/photo/${photo.id}`} alt="" className="h-[300px] w-full object-contain sm:h-[460px]" loading={index < 2 ? "eager" : "lazy"} />
                {post.photos.length > 1 ? (
                  <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">{index + 1} / {post.photos.length}</span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        <div className="p-5">
          {post.price != null ? (
            <div className="text-3xl font-bold text-emerald-700">
              {fmtMoney(post.price, post.currency === "GEL" ? "₾" : "$")}
              {perUnit ? <span className="text-sm font-normal text-gray-500"> {perUnit}</span> : null}
            </div>
          ) : null}
          <h1 className="mt-1 text-xl font-semibold text-gray-900">{post.title}</h1>
          {kind ? <p className="text-sm text-gray-600">{kind}</p> : null}
          {post.location ? <p className="text-sm text-gray-600">📍 {post.location}</p> : null}
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {facts.filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-gray-50 px-3 py-2">
                <dt className="text-[11px] uppercase tracking-wide text-gray-500">{k}</dt>
                <dd className="text-sm font-medium text-gray-900">{v}</dd>
              </div>
            ))}
          </dl>
          {post.description ? (
            <div className="mt-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t.description}</h2>
              <p className="mt-1 whitespace-pre-line text-sm text-gray-800">{post.description}</p>
            </div>
          ) : null}
        </div>
      </div>

      {post.contactPhone ? (
        <div className="ui-card mt-4 p-5">
          <div className="text-[11px] uppercase tracking-wide text-gray-500">{t.contact}</div>
          <div className="mt-0.5 text-lg font-semibold text-gray-900">{post.contactName || settings.agency_name || ""}</div>
          <div className="font-mono text-base text-gray-700">{post.contactPhone}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={`tel:+${phone}`} className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white">{t.call}</a>
            {wa ? <a href={wa} className="rounded-lg bg-green-500 px-5 py-2.5 text-sm font-semibold text-white">{t.whatsapp}</a> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
