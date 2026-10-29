// Public catalog: shared posts marked "catalog" appear in the Telegram mini
// app (/catalog) and can be posted to the agency's Telegram channel.

import type { SharedPost } from "@prisma/client";

export type Lang = "ka" | "en" | "ru";
export const LANGS: Lang[] = ["ka", "en", "ru"];

export function asLang(value: string | null | undefined): Lang {
  const v = (value ?? "").slice(0, 2).toLowerCase();
  return v === "ka" || v === "ru" ? v : "en";
}

export const AVAILABILITY: Record<string, { label: string; cls: string; public: Record<Lang, string> }> = {
  available: { label: "თავისუფალია", cls: "bg-emerald-100 text-emerald-800", public: { ka: "თავისუფალია", en: "Available", ru: "Свободна" } },
  reserved: { label: "დაჯავშნილია", cls: "bg-amber-100 text-amber-800", public: { ka: "დაჯავშნილია", en: "Reserved", ru: "Забронирована" } },
  rented: { label: "გაქირავდა", cls: "bg-gray-200 text-gray-700", public: { ka: "გაქირავდა", en: "Rented", ru: "Сдана" } },
  sold: { label: "გაიყიდა", cls: "bg-gray-200 text-gray-700", public: { ka: "გაიყიდა", en: "Sold", ru: "Продана" } },
};
/** Shown in the mini app; rented/sold ones disappear from it. */
export const PUBLIC_AVAILABILITY = ["available", "reserved"];

export const FEATURES: { key: string; emoji: string; ka: string; en: string; ru: string }[] = [
  { key: "ac", emoji: "❄️", ka: "კონდიციონერი", en: "Air conditioning", ru: "Кондиционер" },
  { key: "heating", emoji: "🔥", ka: "ცენტრალური გათბობა", en: "Central heating", ru: "Центральное отопление" },
  { key: "furniture", emoji: "🛋", ka: "ავეჯი", en: "Furnished", ru: "Мебель" },
  { key: "appliances", emoji: "🔌", ka: "ტექნიკა", en: "Appliances", ru: "Техника" },
  { key: "washer", emoji: "🧺", ka: "სარეცხი მანქანა", en: "Washing machine", ru: "Стиральная машина" },
  { key: "dishwasher", emoji: "🍽", ka: "ჭურჭლის სარეცხი", en: "Dishwasher", ru: "Посудомойка" },
  { key: "oven", emoji: "🍳", ka: "ღუმელი", en: "Oven", ru: "Духовка" },
  { key: "tv", emoji: "📺", ka: "ტელევიზორი", en: "TV", ru: "Телевизор" },
  { key: "internet", emoji: "📶", ka: "ინტერნეტი", en: "Internet", ru: "Интернет" },
  { key: "balcony", emoji: "🌇", ka: "აივანი", en: "Balcony", ru: "Балкон" },
  { key: "terrace", emoji: "🌿", ka: "ტერასა", en: "Terrace", ru: "Терраса" },
  { key: "view", emoji: "🏔", ka: "ხედი", en: "Great view", ru: "Красивый вид" },
  { key: "elevator", emoji: "🛗", ka: "ლიფტი", en: "Elevator", ru: "Лифт" },
  { key: "parking", emoji: "🅿️", ka: "პარკინგი", en: "Parking", ru: "Парковка" },
  { key: "newbuild", emoji: "🏗", ka: "ახალი აშენებული", en: "New building", ru: "Новостройка" },
  { key: "security", emoji: "🛡", ka: "დაცვა", en: "Security", ru: "Охрана" },
  { key: "pool", emoji: "🏊", ka: "აუზი", en: "Pool", ru: "Бассейн" },
  { key: "gym", emoji: "🏋️", ka: "სპორტდარბაზი", en: "Gym", ru: "Спортзал" },
  { key: "yard", emoji: "🌳", ka: "ეზო", en: "Yard", ru: "Двор" },
  { key: "fireplace", emoji: "🪵", ka: "ბუხარი", en: "Fireplace", ru: "Камин" },
];

export const PETS: Record<string, Record<Lang, string>> = {
  yes: { ka: "შინაური ცხოველები: შეიძლება", en: "Pets: allowed", ru: "Животные: разрешены" },
  no: { ka: "შინაური ცხოველები: არა", en: "Pets: not allowed", ru: "Животные: нельзя" },
  ask: { ka: "შინაური ცხოველები: შეთანხმებით", en: "Pets: by agreement", ru: "Животные: по договорённости" },
};

export type DealKind = "rent" | "sale" | "daily";
export function dealKind(dealType: string | null | undefined): DealKind {
  const v = dealType ?? "";
  if (v.includes("დღიურ")) return "daily";
  if (v.includes("იყიდ") || /sale|прода/i.test(v)) return "sale";
  return "rent";
}
export const DEAL_LABEL: Record<DealKind, Record<Lang, string>> = {
  rent: { ka: "ქირავდება", en: "For rent", ru: "Аренда" },
  sale: { ka: "იყიდება", en: "For sale", ru: "Продажа" },
  daily: { ka: "დღიურად", en: "Daily rent", ru: "Посуточно" },
};

const DEAL_TAG: Record<DealKind, Record<Lang, string>> = {
  rent: { ka: "ქირავდება", en: "rent", ru: "аренда" },
  sale: { ka: "იყიდება", en: "sale", ru: "продажа" },
  daily: { ka: "დღიურად", en: "daily", ru: "посуточно" },
};

/** Lease terms are stored as "6+" (months); anything else is shown as typed. */
export const LEASE_TERMS = ["1+", "3+", "6+", "12+"];
export function termText(value: string | null | undefined, lang: Lang): string {
  const n = value?.match(/^(\d+)\+$/)?.[1];
  if (!n) return value ?? "";
  return { ka: `${n} თვიდან`, en: `${n}+ months`, ru: `от ${n} мес.` }[lang];
}

const TYPE_LABEL: Record<string, Record<Lang, string>> = {
  "ბინა": { ka: "ბინა", en: "Apartment", ru: "Квартира" },
  "კერძო სახლი": { ka: "კერძო სახლი", en: "House", ru: "Дом" },
  "აგარაკი": { ka: "აგარაკი", en: "Country house", ru: "Дача" },
  "მიწის ნაკვეთი": { ka: "მიწის ნაკვეთი", en: "Land", ru: "Участок" },
  "კომერციული ფართი": { ka: "კომერციული ფართი", en: "Commercial", ru: "Коммерческая" },
  "სასტუმრო": { ka: "სასტუმრო", en: "Hotel", ru: "Гостиница" },
};
export function typeLabel(type: string | null | undefined, lang: Lang): string {
  if (!type) return TYPE_LABEL["ბინა"][lang];
  return TYPE_LABEL[type]?.[lang] ?? type;
}

// Georgian → Latin / Cyrillic, for district and street names.
const KA_LAT: Record<string, string> = {
  ა: "a", ბ: "b", გ: "g", დ: "d", ე: "e", ვ: "v", ზ: "z", თ: "t", ი: "i", კ: "k", ლ: "l", მ: "m", ნ: "n", ო: "o", პ: "p", ჟ: "zh", რ: "r", ს: "s", ტ: "t", უ: "u", ფ: "p", ქ: "k", ღ: "gh", ყ: "q", შ: "sh", ჩ: "ch", ც: "ts", ძ: "dz", წ: "ts", ჭ: "ch", ხ: "kh", ჯ: "j", ჰ: "h",
};
const KA_CYR: Record<string, string> = {
  ა: "а", ბ: "б", გ: "г", დ: "д", ე: "е", ვ: "в", ზ: "з", თ: "т", ი: "и", კ: "к", ლ: "л", მ: "м", ნ: "н", ო: "о", პ: "п", ჟ: "ж", რ: "р", ს: "с", ტ: "т", უ: "у", ფ: "п", ქ: "к", ღ: "г", ყ: "к", შ: "ш", ჩ: "ч", ც: "ц", ძ: "дз", წ: "ц", ჭ: "ч", ხ: "х", ჯ: "дж", ჰ: "х",
};
const PLACES: Record<string, [string, string]> = {
  "ვაკე": ["Vake", "Ваке"], "საბურთალო": ["Saburtalo", "Сабуртало"], "ვერა": ["Vera", "Вера"], "მთაწმინდა": ["Mtatsminda", "Мтацминда"],
  "სოლოლაკი": ["Sololaki", "Сололаки"], "ძველი თბილისი": ["Old Tbilisi", "Старый Тбилиси"], "ჩუღურეთი": ["Chughureti", "Чугурети"],
  "დიდუბე": ["Didube", "Дидубе"], "ისანი": ["Isani", "Исани"], "სამგორი": ["Samgori", "Самгори"], "ნაძალადევი": ["Nadzaladevi", "Надзаладеви"],
  "გლდანი": ["Gldani", "Глдани"], "კრწანისი": ["Krtsanisi", "Крцаниси"], "დიღომი": ["Dighomi", "Дигоми"], "დიდი დიღომი": ["Didi Dighomi", "Диди Дигоми"],
  "ავლაბარი": ["Avlabari", "Авлабари"], "ორთაჭალა": ["Ortachala", "Ортачала"], "ბაგები": ["Bagebi", "Багеби"], "წყნეთი": ["Tskneti", "Цхнети"],
  "ლისი": ["Lisi", "Лиси"], "მარჯანიშვილი": ["Marjanishvili", "Марджанишвили"], "ვაჟა-ფშაველა": ["Vazha-Pshavela", "Важа-Пшавела"],
  "დიღმის მასივი": ["Dighomi Massive", "Дигомский массив"], "ვაკე-საბურთალო": ["Vake-Saburtalo", "Ваке-Сабуртало"], "თბილისი": ["Tbilisi", "Тбилиси"],
  "ბათუმი": ["Batumi", "Батуми"], "მთაწმინდა-კრწანისი": ["Mtatsminda-Krtsanisi", "Мтацминда-Крцаниси"], "ლილო": ["Lilo", "Лило"],
  "ვარკეთილი": ["Varketili", "Варкетили"], "ნავთლუღი": ["Navtlughi", "Навтлуги"], "კუს ტბა": ["Turtle Lake", "Черепашье озеро"],
};
const WORDS: Record<string, [string, string]> = {
  "ქ.": ["St.", "ул."], "ქუჩა": ["St.", "ул."], "გამზ.": ["Ave.", "пр."], "გამზირი": ["Ave.", "пр."], "ჩიხი": ["Dead end", "тупик"], "შესახვევი": ["Lane", "пер."],
};

export function placeName(text: string | null | undefined, lang: Lang): string {
  if (!text) return "";
  if (lang === "ka") return text;
  const i = lang === "en" ? 0 : 1;
  let out = text;
  // Known names, also in their case forms ("ვაჟა-ფშაველას გამზ." -> "Vazha-Pshavela Ave.").
  for (const [ka, names] of Object.entries(PLACES).sort((a, b) => b[0].length - a[0].length)) {
    out = out.replace(new RegExp(`(?<![\\u10D0-\\u10FF])${ka}(?:ის|ს|ში|ზე)?(?![\\u10D0-\\u10FF])`, "g"), names[i]);
  }
  for (const [ka, names] of Object.entries(WORDS)) out = out.split(ka).join(names[i]);
  const map = lang === "en" ? KA_LAT : KA_CYR;
  out = out.replace(/[ა-ჿ]+/g, (word) => {
    const t = [...word].map((ch) => map[ch] ?? ch).join("");
    return t.charAt(0).toUpperCase() + t.slice(1);
  });
  return out;
}

export function featureList(csv: string | null | undefined): string[] {
  const keys = new Set((csv ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  return FEATURES.filter((f) => keys.has(f.key)).map((f) => f.key);
}

export function priceText(price: number | null | undefined, currency: string, kind: DealKind, lang: Lang): string {
  if (price == null) return { ka: "ფასი შეთანხმებით", en: "Price on request", ru: "Цена по запросу" }[lang];
  const sym = currency === "GEL" ? "₾" : "$";
  const n = Math.round(price).toLocaleString("en-US").replace(/,/g, " ");
  const per = kind === "rent" ? { ka: "/თვე", en: "/mo", ru: "/мес" }[lang] : kind === "daily" ? { ka: "/დღე", en: "/day", ru: "/сутки" }[lang] : "";
  return currency === "GEL" ? `${n} ${sym}${per}` : `${sym}${n}${per}`;
}

/** Price in USD for filters (GEL converted at an approximate rate). */
export function priceUsd(price: number | null | undefined, currency: string): number | null {
  if (price == null) return null;
  return currency === "GEL" ? Math.round(price / 2.7) : price;
}

export function roomsLabel(rooms: number | null | undefined, lang: Lang): string {
  if (!rooms) return "";
  return { ka: `${rooms}-ოთახიანი`, en: `${rooms}-room`, ru: `${rooms}-комн.` }[lang];
}

export function headline(post: Pick<SharedPost, "propertyType" | "rooms" | "district" | "location">, lang: Lang): string {
  const type = typeLabel(post.propertyType, lang);
  const rooms = post.rooms && (!post.propertyType || post.propertyType === "ბინა") ? roomsLabel(post.rooms, lang) : "";
  const what = rooms ? (lang === "en" ? `${rooms} ${type.toLowerCase()}` : `${rooms} ${lang === "ru" ? type.toLowerCase() : type}`) : type;
  const where = placeName(post.district || post.location?.split(",")[0], lang);
  return [what.charAt(0).toUpperCase() + what.slice(1), where].filter(Boolean).join(" · ");
}

export function descriptionFor(post: Pick<SharedPost, "description" | "descriptionEn" | "descriptionRu">, lang: Lang): string {
  if (lang === "en") return post.descriptionEn || post.description || post.descriptionRu || "";
  if (lang === "ru") return post.descriptionRu || post.descriptionEn || post.description || "";
  return post.description || post.descriptionEn || post.descriptionRu || "";
}

/** Approximate a point to a ~500 m grid when the exact place is private. */
export function publicPoint(lat: number | null, lng: number | null, mode: string): { lat: number; lng: number; exact: boolean } | null {
  if (lat == null || lng == null || mode === "off") return null;
  if (mode === "exact") return { lat, lng, exact: true };
  const step = 0.005;
  return { lat: Math.round(lat / step) * step, lng: Math.round(lng / step) * step, exact: false };
}

// ---------------------------------------------------------------- channel ---

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function tag(text: string): string {
  return "#" + text.replace(/[^\p{L}\p{N}]+/gu, "");
}

function priceTag(usd: number | null, kind: DealKind, lang: Lang): string | null {
  if (usd == null) return null;
  const steps = kind === "sale" ? [50000, 80000, 120000, 200000, 350000] : kind === "daily" ? [30, 60, 100, 200] : [500, 800, 1200, 2000, 3000];
  const upTo = { ka: "მდე", en: "upto", ru: "до" }[lang];
  const over = { ka: "ზემოთ", en: "over", ru: "от" }[lang];
  const limit = steps.find((s) => usd <= s);
  if (limit) return lang === "ka" ? `#${limit}${upTo}` : `#${upTo}${limit}`;
  const top = steps[steps.length - 1];
  return lang === "ka" ? `#${top}${over}` : `#${over}${top}`;
}

/** details is null when the flat is only in the channel, not in the mini app. */
export type CaptionLinks = { details: string | null; catalog: string; manager?: string | null };

/** HTML caption for the channel post (Telegram caps captions at 1024 chars). */
export function channelCaption(post: SharedPost, lang: Lang, links: CaptionLinks): string {
  const kind = dealKind(post.dealType);
  const L = (ka: string, en: string, ru: string) => ({ ka, en, ru })[lang];
  const status = post.availability !== "available" ? `${post.availability === "reserved" ? "🟡" : "🔴"} <b>${AVAILABILITY[post.availability]?.public[lang] ?? ""}</b>\n\n` : "";
  const facts = [
    post.area ? `${post.area} ${L("მ²", "m²", "м²")}` : "",
    post.floor ? `${post.floor}${post.totalFloors ? `/${post.totalFloors}` : ""} ${L("სართ.", "floor", "этаж")}` : "",
    post.bedrooms ? `${post.bedrooms} ${L("საძინებელი", post.bedrooms > 1 ? "bedrooms" : "bedroom", "спальни")}` : "",
    post.bathrooms ? `${post.bathrooms} ${L("სველი წერტ.", "bath", "с/у")}` : "",
  ].filter(Boolean).join(" | ");
  const features = featureList(post.features).map((k) => FEATURES.find((f) => f.key === k)!).map((f) => f[lang]);
  const place = placeName(post.location || post.district, lang);
  const extra = [post.pets && PETS[post.pets] ? `🐾 ${PETS[post.pets][lang]}` : "", post.leaseTerm && kind === "rent" ? `🕐 ${L("ვადა", "Term", "Срок")}: ${termText(post.leaseTerm, lang)}` : ""].filter(Boolean);
  const tags = [
    tag(DEAL_TAG[kind][lang]),
    post.district ? tag(placeName(post.district, lang)) : "",
    post.rooms ? (lang === "ka" ? `#${post.rooms}ოთახიანი` : lang === "en" ? `#${post.rooms}rooms` : `#${post.rooms}комнаты`) : "",
    priceTag(priceUsd(post.price, post.currency), kind, lang) ?? "",
    post.pets === "yes" ? L("#ცხოველებით", "#petfriendly", "#сживотными") : "",
  ].filter(Boolean).join(" ");
  const linksBlock = [
    links.details ? `👉 <a href="${links.details}">${L("დეტალები და ყველა ფოტო", "Details and all photos", "Подробнее и все фото")}</a>` : "",
    links.manager ? `💬 <a href="${links.manager}">${L("მიწერე მენეჯერს", "Message the manager", "Написать менеджеру")}</a>` : "",
    `🔎 <a href="${links.catalog}">${L("ყველა ბინა — ფილტრები და რუკა", "All listings — filters and map", "Все объекты — фильтры и карта")}</a>`,
  ].filter(Boolean).join("\n");

  const head = [
    `${status}🏠 <b>${escapeHtml(headline(post, lang))}</b>`,
    place ? `📍 ${escapeHtml(place)}` : "",
    "",
    `💰 <b>${escapeHtml(priceText(post.price, post.currency, kind, lang))}</b>`,
    facts,
    features.length ? `✅ ${escapeHtml(features.join(" · "))}` : "",
    ...extra,
  ].filter((line, i, all) => line !== "" || (i > 0 && all[i - 1] !== "")).join("\n");
  const tail = `\n\n${tags}${post.refNo ? `  🆔 ${post.refNo}` : ""}\n\n${linksBlock}`;

  const visible = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&(amp|lt|gt);/g, "x").length;
  const room = 1000 - visible(head) - visible(tail);
  let description = descriptionFor(post, lang).replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (room < 80) description = "";
  else if (description.length > room) description = description.slice(0, room - 1).replace(/\s+\S*$/, "") + "…";
  return head + (description ? `\n\n${escapeHtml(description)}` : "") + tail;
}

// ---------------------------------------------------------------- mini app ---

export type CatalogItem = {
  ref: number;
  kind: DealKind;
  type: string | null;
  district: string | null;
  location: string | null;
  price: number | null;
  currency: string;
  usd: number | null;
  area: number | null;
  rooms: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  totalFloors: number | null;
  condition: string | null;
  features: string[];
  pets: string | null;
  leaseTerm: string | null;
  availability: string;
  description: Record<Lang, string>;
  point: { lat: number; lng: number; exact: boolean } | null;
  photos: string[];
  createdAt: string;
};

export function toCatalogItem(post: SharedPost & { photos: { id: string }[] }): CatalogItem {
  return {
    ref: post.refNo ?? 0,
    kind: dealKind(post.dealType),
    type: post.propertyType,
    district: post.district,
    location: post.location,
    price: post.price,
    currency: post.currency,
    usd: priceUsd(post.price, post.currency),
    area: post.area,
    rooms: post.rooms,
    bedrooms: post.bedrooms,
    bathrooms: post.bathrooms,
    floor: post.floor,
    totalFloors: post.totalFloors,
    condition: post.condition,
    features: featureList(post.features),
    pets: post.pets,
    leaseTerm: post.leaseTerm,
    availability: post.availability,
    description: { ka: descriptionFor(post, "ka"), en: descriptionFor(post, "en"), ru: descriptionFor(post, "ru") },
    point: publicPoint(post.lat, post.lng, post.mapMode),
    photos: post.photos.map((p) => `/api/catalog/photo/${p.id}`),
    createdAt: post.channelPostedAt?.toISOString() ?? post.updatedAt.toISOString(),
  };
}
