// The public website (/flats, /flat/1023): the same flats as the mini app, as
// plain pages Google can index.  Each page links into the Telegram mini app.

import { prisma } from "./db";
import { DEAL_LABEL, asLang, dealKind, headline, placeName, priceText, publicWhere, type Lang } from "./catalog";
import { getSettings } from "./settings";
import { shareBase } from "./shareUrl";

export const SITE_TEXT: Record<Lang, {
  siteTitle: (agency: string) => string;
  siteDescription: string;
  all: string;
  openTg: string;
  writeManager: string;
  call: string;
  listings: (n: number) => string;
  rentTitle: string;
  saleTitle: string;
  dailyTitle: string;
  ctaTitle: string;
  ctaText: string;
  backToAll: string;
}> = {
  en: {
    siteTitle: (a) => `Apartments for rent and sale in Tbilisi — ${a}`,
    siteDescription: "Verified apartments for rent and sale in Tbilisi: photos, prices, metro and map. Message us on Telegram and book a viewing.",
    all: "All",
    openTg: "Open in Telegram",
    writeManager: "Message the manager",
    call: "Call",
    listings: (n) => `${n} listings`,
    rentTitle: "Apartments for rent in Tbilisi",
    saleTitle: "Apartments for sale in Tbilisi",
    dailyTitle: "Daily rentals in Tbilisi",
    ctaTitle: "Book a viewing",
    ctaText: "Open this flat in our Telegram app: more photos, the map, saving and a viewing request in one tap.",
    backToAll: "← All listings",
  },
  ru: {
    siteTitle: (a) => `Квартиры в аренду и на продажу в Тбилиси — ${a}`,
    siteDescription: "Проверенные квартиры в аренду и на продажу в Тбилиси: фото, цены, метро и карта. Пишите в Telegram и записывайтесь на просмотр.",
    all: "Все",
    openTg: "Открыть в Telegram",
    writeManager: "Написать менеджеру",
    call: "Позвонить",
    listings: (n) => `${n} объектов`,
    rentTitle: "Аренда квартир в Тбилиси",
    saleTitle: "Продажа квартир в Тбилиси",
    dailyTitle: "Посуточная аренда в Тбилиси",
    ctaTitle: "Записаться на просмотр",
    ctaText: "Откройте квартиру в нашем Telegram-приложении: больше фото, карта, избранное и заявка на просмотр в одно касание.",
    backToAll: "← Все объекты",
  },
  ka: {
    siteTitle: (a) => `ბინები ქირით და იყიდება თბილისში — ${a}`,
    siteDescription: "გადამოწმებული ბინები ქირით და გასაყიდად თბილისში: ფოტოები, ფასები, მეტრო და რუკა. მოგვწერეთ Telegram-ში და დაჯავშნეთ ჩვენება.",
    all: "ყველა",
    openTg: "გახსნა Telegram-ში",
    writeManager: "მიწერე მენეჯერს",
    call: "დარეკვა",
    listings: (n) => `${n} განცხადება`,
    rentTitle: "ბინები ქირით თბილისში",
    saleTitle: "იყიდება ბინები თბილისში",
    dailyTitle: "დღიური ქირა თბილისში",
    ctaTitle: "ჩვენების დაჯავშნა",
    ctaText: "გახსენი ბინა ჩვენს Telegram აპში: მეტი ფოტო, რუკა, შენახვა და ჩვენების მოთხოვნა ერთი შეხებით.",
    backToAll: "← ყველა განცხადება",
  },
};

export function siteLang(value: string | null | undefined): Lang {
  return value ? asLang(value) : "en";
}

export async function siteBase(): Promise<string> {
  const settings = await getSettings();
  return shareBase(settings.public_base_url);
}

export async function sitePosts() {
  return prisma.sharedPost.findMany({
    where: publicWhere(),
    orderBy: [{ availability: "asc" }, { channelPostedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
    take: 1000,
    include: { photos: { orderBy: [{ position: "asc" }, { id: "asc" }], select: { id: true, kind: true } } },
  });
}

/** "2-room apartment · Vake — $900/mo" for titles. */
export function flatTitle(post: Parameters<typeof headline>[0] & { price: number | null; currency: string; dealType: string | null }, lang: Lang): string {
  const kind = dealKind(post.dealType);
  return `${headline(post, lang)} — ${priceText(post.price, post.currency, kind, lang)} · ${DEAL_LABEL[kind][lang]}`;
}

export { placeName };
