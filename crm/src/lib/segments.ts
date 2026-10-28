import type { Prisma } from "@prisma/client";

/** Public listing collections for a target group, reachable without login (QR code). */
export type PublicLang = "en" | "ru";

export type Segment = {
  slug: string;
  title: string; // Georgian, for the CRM
  titleEn: string; // for the public page (in the page language)
  descriptionEn: string;
  lang: PublicLang;
  dealTypes: string[];
  districts: string[];
  neighbourhoods: string[];
  maxPriceUsd?: number;
  minPriceUsd?: number;
};

export const SEGMENTS: Segment[] = [
  {
    slug: "indian",
    title: "ინდოელი მდგმურები",
    titleEn: "Apartments for rent — Indian community",
    descriptionEn: "Long-term rentals in Samgori, Varketili, 300 Aragveli, Isani and nearby. We help you view and sign; owners are verified.",
    lang: "en",
    dealTypes: ["ქირავდება"],
    districts: ["ისანი-სამგორი"],
    neighbourhoods: ["სამგორი", "ვარკეთილი", "ისანი", "ვაზისუბანი", "ნავთლუღი", "მესამე მასივი", "ორხევი", "ლილო", "აეროპორტის დასახლება", "დამპალოს დასახლება"],
    maxPriceUsd: 1200,
  },
  {
    slug: "expats",
    title: "ექსპატები",
    titleEn: "Apartments for rent in Tbilisi — for expats",
    descriptionEn: "Long-term rentals in Vake, Vera, Mtatsminda, Sololaki, Saburtalo and the Old Town. Modern renovation, verified owners; we arrange viewings and an English contract.",
    lang: "en",
    dealTypes: ["ქირავდება"],
    districts: ["ძველი თბილისი"],
    neighbourhoods: ["ვაკე", "ვერა", "მთაწმინდა", "სოლოლაკი", "საბურთალო", "ვაკე-საბურთალო", "ავლაბარი", "ჩუღურეთი", "ლისი", "წყნეთი", "ბაგები"],
    minPriceUsd: 500,
    maxPriceUsd: 3000,
  },
  {
    slug: "students",
    title: "სტუდენტები",
    titleEn: "Student rentals near the universities",
    descriptionEn: "Affordable long-term rentals in Saburtalo, Vake, Vera and Didube, close to TSU, GTU, Medical University and Ilia State. We arrange viewings and contracts.",
    lang: "en",
    dealTypes: ["ქირავდება"],
    districts: [],
    neighbourhoods: ["საბურთალო", "ვაკე", "ვერა", "დიდუბე", "ვაჟა-ფშაველას კვარტლები", "ბაგები", "დიღმის მასივი"],
    maxPriceUsd: 700,
  },
  {
    slug: "tourists",
    title: "ტურისტები (დღიური)",
    titleEn: "Short-term apartments in central Tbilisi",
    descriptionEn: "Daily and weekly rentals in Vake, Vera, Sololaki, Mtatsminda, Avlabari and Old Tbilisi. Message us with your dates and we confirm availability.",
    lang: "en",
    dealTypes: ["ქირავდება დღიურად"],
    districts: ["ძველი თბილისი"],
    neighbourhoods: ["ვაკე", "ვერა", "სოლოლაკი", "მთაწმინდა", "ავლაბარი", "საბურთალო", "ჩუღურეთი", "აბანოთუბანი"],
  },
  {
    slug: "ru",
    title: "რუსულენოვანი ექსპატები",
    titleEn: "Аренда квартир в Тбилиси — для экспатов",
    descriptionEn: "Долгосрочная аренда в Ваке, Сабуртало, Вера, Мтацминда и Сололаки. Поможем с просмотром и договором, объявления от проверенных собственников.",
    lang: "ru",
    dealTypes: ["ქირავდება"],
    districts: [],
    neighbourhoods: ["ვაკე", "საბურთალო", "ვერა", "მთაწმინდა", "სოლოლაკი", "ჩუღურეთი", "ავლაბარი", "დიდუბე", "დიღმის მასივი", "ბაგები"],
    minPriceUsd: 500,
  },
];

export const PUBLIC_TEXT: Record<PublicLang, Record<string, string>> = {
  en: {
    agency: "Real estate agency",
    listings: "listings",
    updated: "updated automatically every 30 minutes",
    none: "No listings at the moment. Contact us and we will find one for you.",
    month: "/ month",
    day: "/ day",
    rooms: "rooms",
    floor: "floor",
    bedrooms: "bedrooms",
    ask: "Ask on WhatsApp",
    call: "Call us",
    wa: "WhatsApp us",
    ref: "Ref",
    footer: "We act as your agent: viewing, negotiation and contract. Owner contacts are shared after a short call.",
    today: "today",
    yesterday: "yesterday",
    daysAgo: "days ago",
    interested: "Hello! I am interested in rental",
  },
  ru: {
    agency: "Агентство недвижимости",
    listings: "объявлений",
    updated: "обновляется автоматически каждые 30 минут",
    none: "Сейчас объявлений нет. Напишите нам — подберём.",
    month: "/ мес.",
    day: "/ сутки",
    rooms: "комн.",
    floor: "этаж",
    bedrooms: "спальни",
    ask: "Написать в WhatsApp",
    call: "Позвонить",
    wa: "Написать нам",
    ref: "Код",
    footer: "Мы выступаем вашим агентом: просмотр, переговоры и договор. Контакты собственника — после короткого звонка.",
    today: "сегодня",
    yesterday: "вчера",
    daysAgo: "дн. назад",
    interested: "Здравствуйте! Меня интересует объект",
  },
};

export const RU_DEAL: Record<string, string> = { "ქირავდება": "Аренда", "ქირავდება დღიურად": "Посуточно", "იყიდება": "Продажа", "გირავდება": "Залог" };
export const RU_TYPE: Record<string, string> = { "ბინა": "Квартира", "კერძო სახლი": "Дом", "აგარაკი": "Дача", "კომერციული ფართი": "Коммерческая", "მიწის ნაკვეთი": "Участок", "სასტუმრო": "Отель" };
export const RU_PLACE: Record<string, string> = {
  "ვაკე": "Ваке", "საბურთალო": "Сабуртало", "ვერა": "Вера", "მთაწმინდა": "Мтацминда", "სოლოლაკი": "Сололаки", "ჩუღურეთი": "Чугурети",
  "ავლაბარი": "Авлабари", "დიდუბე": "Дидубе", "დიღმის მასივი": "Дигоми", "ბაგები": "Багеби", "თბილისი": "Тбилиси", "ვაკე-საბურთალო": "Ваке-Сабуртало",
  "ძველი თბილისი": "Старый Тбилиси", "დიდუბე-ჩუღურეთი": "Дидубе-Чугурети", "ისანი-სამგორი": "Исани-Самгори", "გლდანი-ნაძალადევი": "Глдани-Надзаладеви",
};
export const RU_CONDITION: Record<string, string> = {
  "ახალი გარემონტებული": "Свежий ремонт", "გარემონტებული": "С ремонтом", "ძველი გარემონტებული": "Старый ремонт", "ევრორემონტი": "Евроремонт",
  "მიმდინარე რემონტი": "Идёт ремонт", "სარემონტო": "Требует ремонта", "გასარემონტებელი": "Требует ремонта", "თეთრი კარკასი": "Белый каркас", "შავი კარკასი": "Чёрный каркас",
  "ახალი აშენებული": "Новостройка", "ძველი აშენებული": "Старый фонд", "მშენებარე": "Строится",
};

export function segmentBySlug(slug: string): Segment | undefined {
  return SEGMENTS.find((segment) => segment.slug === slug);
}

export function segmentWhere(segment: Segment): Prisma.ListingWhereInput {
  const where: Prisma.ListingWhereInput = {
    archived: false,
    dealType: { in: segment.dealTypes },
    OR: [{ district: { in: segment.districts } }, { neighbourhood: { in: segment.neighbourhoods } }],
    AND: [{ OR: [{ lead: null }, { lead: { hidden: false } }] }],
  };
  if (segment.maxPriceUsd || segment.minPriceUsd) where.priceUsd = { lte: segment.maxPriceUsd, gte: segment.minPriceUsd };
  return where;
}

/** Filters an agent can change on a segment's CRM page (defaults = the segment). */
export type SegmentFilters = {
  deal: string;
  areas: string[];
  priceMin?: number;
  priceMax?: number;
  roomsMin?: number;
  areaMin?: number;
  days?: number;
  owner: boolean;
  type: string;
};

const numParam = (value: string | string[] | undefined): number | undefined => {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export function segmentFilters(segment: Segment, params: Record<string, string | string[] | undefined>): SegmentFilters {
  const changed = params.f === "1"; // the filter form was submitted
  const areas = params.areas ? (Array.isArray(params.areas) ? params.areas : [params.areas]) : [];
  return {
    deal: typeof params.deal === "string" ? params.deal : segment.dealTypes[0] ?? "",
    areas: changed ? areas : [...segment.districts, ...segment.neighbourhoods],
    priceMin: changed ? numParam(params.priceMin) : segment.minPriceUsd,
    priceMax: changed ? numParam(params.priceMax) : segment.maxPriceUsd,
    roomsMin: numParam(params.roomsMin),
    areaMin: numParam(params.areaMin),
    days: numParam(params.days),
    owner: params.owner === "1",
    type: typeof params.type === "string" ? params.type : "ბინა",
  };
}

export function segmentFiltersWhere(filters: SegmentFilters): Prisma.ListingWhereInput {
  const and: Prisma.ListingWhereInput[] = [{ archived: false }, { OR: [{ lead: null }, { lead: { hidden: false } }] }];
  if (filters.deal) and.push({ dealType: filters.deal });
  if (filters.type) and.push({ propertyType: filters.type });
  if (filters.areas.length) and.push({ OR: [{ district: { in: filters.areas } }, { neighbourhood: { in: filters.areas } }] });
  if (filters.priceMin || filters.priceMax) and.push({ priceUsd: { gte: filters.priceMin, lte: filters.priceMax } });
  if (filters.roomsMin) and.push({ rooms: { gte: filters.roomsMin } });
  if (filters.areaMin) and.push({ areaM2: { gte: filters.areaMin } });
  if (filters.days) and.push({ collectedAt: { gte: new Date(Date.now() - filters.days * 86_400_000) } });
  if (filters.owner) and.push({ posterKind: "owner" });
  return { AND: and };
}

export const EN_DEAL: Record<string, string> = {
  "ქირავდება": "For rent",
  "ქირავდება დღიურად": "Daily rent",
  "იყიდება": "For sale",
  "გირავდება": "Mortgage",
};
export const EN_TYPE: Record<string, string> = {
  "ბინა": "Apartment",
  "კერძო სახლი": "House",
  "აგარაკი": "Country house",
  "კომერციული ფართი": "Commercial",
  "მიწის ნაკვეთი": "Land",
  "სასტუმრო": "Hotel",
};
export const EN_PLACE: Record<string, string> = {
  "სამგორი": "Samgori",
  "ვარკეთილი": "Varketili",
  "ისანი": "Isani",
  "ვაზისუბანი": "Vazisubani",
  "ნავთლუღი": "Navtlughi",
  "მესამე მასივი": "Third Massive (Samgori)",
  "ორხევი": "Orkhevi",
  "ლილო": "Lilo",
  "აეროპორტის დასახლება": "Airport settlement",
  "დამპალოს დასახლება": "Dampalo",
  "ისანი-სამგორი": "Isani-Samgori",
  "საბურთალო": "Saburtalo",
  "ვაკე": "Vake",
  "დიდუბე": "Didube",
  "გლდანი": "Gldani",
  "ნაძალადევი": "Nadzaladevi",
  "ჩუღურეთი": "Chugureti",
  "მთაწმინდა": "Mtatsminda",
  "სოლოლაკი": "Sololaki",
  "ავლაბარი": "Avlabari",
  "დიდი დიღომი": "Didi Dighomi",
  "დიღომი 1-9": "Dighomi 1-9",
  "ვაშლიჯვარი": "Vashlijvari",
  "თბილისი": "Tbilisi",
};

export const EN_CONDITION: Record<string, string> = {
  "ახალი გარემონტებული": "Newly renovated",
  "გარემონტებული": "Renovated",
  "ძველი გარემონტებული": "Older renovation",
  "ევრორემონტი": "Euro renovation",
  "მიმდინარე რემონტი": "Under renovation",
  "სარემონტო": "Needs renovation",
  "გასარემონტებელი": "Needs renovation",
  "თეთრი კარკასი": "White frame",
  "შავი კარკასი": "Black frame",
  "მწვანე კარკასი": "Green frame",
  "ახალი აშენებული": "New building",
  "ძველი აშენებული": "Old building",
  "მშენებარე": "Under construction",
};

export function en(map: Record<string, string>, value: string | null | undefined): string {
  if (!value) return "";
  return map[value] ?? value;
}
