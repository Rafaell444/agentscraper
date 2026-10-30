"use client";

import { useMemo, useState } from "react";
import { CURRENCY_SIGN, convert, type CatalogItem, type Currency, type DealKind, type Lang, type Rates } from "@/lib/catalog";
import { haptic } from "./tg";

// "Moving to Tbilisi?": a monthly budget for expats.  Rent comes from our own
// listings (median for the chosen rooms and area); everything else is a rough
// estimate in lari, to be adjusted here when prices change.

const CENTRE = ["ვაკე", "ვერა", "სოლოლაკი", "მთაწმინდა", "ძველი თბილისი", "ავლაბარი", "ჩუღურეთი"];
const MIDDLE = ["საბურთალო", "დიდუბე", "დიღომი", "დიდი დიღომი", "ორთაჭალა", "კრწანისი", "ბაგები", "ლისი", "ნაძალადევი"];
type Area = "centre" | "middle" | "outer";
type Household = "one" | "couple" | "family";
type Style = "budget" | "comfort";

// Lari per month, October 2026.
const COSTS = {
  rentUsd: { 1: 550, 2: 800, 3: 1150 } as Record<number, number>, // when we have no listings to go by
  areaFactor: { centre: 1.25, middle: 1, outer: 0.75 } as Record<Area, number>,
  utilities: { 1: 150, 2: 200, 3: 260 } as Record<number, number>, // year average: ~100 in summer, 300+ in winter (gas heating)
  internet: 50,
  mobile: 20, // per adult
  transport: { budget: 60, comfort: 220 }, // per adult: metro/bus 1 ₾ a ride vs. taxis
  groceries: { budget: 450, comfort: 750 }, // per adult; a child counts as 0.6
  eatingOut: { budget: 150, comfort: 500 }, // per adult
  extras: { budget: 50, comfort: 200 }, // per adult: gym, cinema, small things
};

const T = {
  en: {
    title: "Moving to Tbilisi?", sub: "Your monthly budget, with rent from our current listings.",
    household: "Who is moving", one: "Just me", couple: "Couple", family: "Family with kids",
    rooms: "Flat", roomsN: (n: number) => `${n} room${n > 1 ? "s" : ""}`, area: "Area", centre: "Centre", middle: "Saburtalo & around", outer: "Outskirts",
    style: "Lifestyle", budget: "Budget", comfort: "Comfortable",
    rent: "Rent", utilities: "Utilities", internet: "Internet & mobile", transport: "Transport", groceries: "Groceries", eatingOut: "Cafés & restaurants", extras: "Other",
    total: "Total per month", fromListings: (n: number) => `rent: median of ${n} of our listings`, estimate: "rent: typical price (no listings to compare)",
    winter: "Utilities are a year average: about 100 ₾ in summer and 300 ₾+ in winter (gas heating).",
    note: "Estimates for October 2026. Your real costs depend on your habits.",
    seeFlats: "See flats for this budget",
    visa: "Can I stay?", citizenship: "Your passport", check: "Rules change: check before you travel on",
    longer: "Staying longer: a residence permit through work, your own business (many expats register as an individual entrepreneur) or buying property worth $100,000+.",
    rules: {
      year: "Visa-free for up to 1 year.",
      india: "You need a visa (e-visa online). With a valid visa or residence permit of the USA, UK, EU/Schengen and some other countries: visa-free for 90 days in any 180.",
      china: "Visa-free for up to 30 days.",
      iran: "Visa-free for up to 45 days.",
      other: "Rules depend on your country.",
    },
    countries: { year: "EU, UK, USA, Canada, Australia, Israel, Turkey, Ukraine, Russia, Belarus, Kazakhstan, Armenia, Azerbaijan, UAE, Japan, Korea…", india: "India", china: "China", iran: "Iran", other: "Other" },
  },
  ru: {
    title: "Переезжаете в Тбилиси?", sub: "Ваш бюджет на месяц, аренда — по нашим текущим объектам.",
    household: "Кто переезжает", one: "Я один / одна", couple: "Пара", family: "Семья с детьми",
    rooms: "Квартира", roomsN: (n: number) => `${n}-комн.`, area: "Район", centre: "Центр", middle: "Сабуртало и рядом", outer: "Окраины",
    style: "Образ жизни", budget: "Экономно", comfort: "Комфортно",
    rent: "Аренда", utilities: "Коммунальные", internet: "Интернет и связь", transport: "Транспорт", groceries: "Продукты", eatingOut: "Кафе и рестораны", extras: "Прочее",
    total: "Итого в месяц", fromListings: (n: number) => `аренда: медиана ${n} наших объектов`, estimate: "аренда: типичная цена (нет объектов для сравнения)",
    winter: "Коммунальные — среднее за год: около 100 ₾ летом и 300 ₾+ зимой (газовое отопление).",
    note: "Оценка на октябрь 2026. Реальные расходы зависят от привычек.",
    seeFlats: "Квартиры под этот бюджет",
    visa: "Могу ли я остаться?", citizenship: "Ваш паспорт", check: "Правила меняются — проверьте перед поездкой на",
    longer: "Чтобы жить дольше: вид на жительство по работе, своему бизнесу (многие регистрируются как ИП) или при покупке недвижимости от $100 000.",
    rules: {
      year: "Без визы до 1 года.",
      india: "Нужна виза (электронная). С действующей визой или ВНЖ США, Великобритании, ЕС/Шенгена и ряда стран — без визы 90 дней из 180.",
      china: "Без визы до 30 дней.",
      iran: "Без визы до 45 дней.",
      other: "Правила зависят от страны.",
    },
    countries: { year: "ЕС, Великобритания, США, Канада, Австралия, Израиль, Турция, Украина, Россия, Беларусь, Казахстан, Армения, Азербайджан, ОАЭ, Япония, Корея…", india: "Индия", china: "Китай", iran: "Иран", other: "Другая страна" },
  },
  ka: {
    title: "თბილისში გადმოდიხარ?", sub: "თვიური ბიუჯეტი; ქირა — ჩვენი მიმდინარე განცხადებებით.",
    household: "ვინ გადმოდის", one: "მხოლოდ მე", couple: "წყვილი", family: "ოჯახი ბავშვებით",
    rooms: "ბინა", roomsN: (n: number) => `${n}-ოთახიანი`, area: "უბანი", centre: "ცენტრი", middle: "საბურთალო და ახლოს", outer: "გარეუბანი",
    style: "ცხოვრების სტილი", budget: "ეკონომიური", comfort: "კომფორტული",
    rent: "ქირა", utilities: "კომუნალური", internet: "ინტერნეტი და მობილური", transport: "ტრანსპორტი", groceries: "საკვები", eatingOut: "კაფე-რესტორნები", extras: "სხვა",
    total: "სულ თვეში", fromListings: (n: number) => `ქირა: ${n} ჩვენი განცხადების მედიანა`, estimate: "ქირა: ტიპური ფასი (შესადარებელი განცხადება არ არის)",
    winter: "კომუნალური — წლის საშუალო: ზაფხულში ~100 ₾, ზამთარში 300 ₾+ (გაზის გათბობა).",
    note: "შეფასება 2026 წლის ოქტომბრისთვის. რეალური ხარჯი ჩვევებზეა დამოკიდებული.",
    seeFlats: "ბინები ამ ბიუჯეტით",
    visa: "რამდენ ხანს შემიძლია დარჩენა?", citizenship: "შენი პასპორტი", check: "წესები იცვლება — გადაამოწმე მგზავრობამდე:",
    longer: "უფრო დიდხანს: ბინადრობის ნებართვა სამუშაოთი, საკუთარი ბიზნესით (ბევრი ინდ. მეწარმედ რეგისტრირდება) ან $100 000+ ღირებულების უძრავი ქონების ყიდვით.",
    rules: {
      year: "უვიზოდ 1 წლამდე.",
      india: "საჭიროა ვიზა (ელექტრონული). აშშ-ის, დიდი ბრიტანეთის, ევროკავშირის/შენგენის და სხვა ქვეყნების მოქმედი ვიზით ან ბინადრობით — უვიზოდ 90 დღე 180-დან.",
      china: "უვიზოდ 30 დღემდე.",
      iran: "უვიზოდ 45 დღემდე.",
      other: "წესები ქვეყანაზეა დამოკიდებული.",
    },
    countries: { year: "ევროკავშირი, დიდი ბრიტანეთი, აშშ, კანადა, ავსტრალია, ისრაელი, თურქეთი, უკრაინა, რუსეთი, ბელარუსი, ყაზახეთი, სომხეთი, აზერბაიჯანი, არაბეთის საემიროები, იაპონია, კორეა…", india: "ინდოეთი", china: "ჩინეთი", iran: "ირანი", other: "სხვა ქვეყანა" },
  },
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

function Choice<V extends string | number>({ value, options, onChange }: { value: V; options: [V, string][]; onChange: (v: V) => void }) {
  return (
    <div className="flex gap-1.5">
      {options.map(([v, label]) => (
        <button key={String(v)} type="button" onClick={() => { haptic("select"); onChange(v); }} className={`min-h-10 flex-1 rounded-xl border px-2 py-2 text-xs font-semibold ${value === v ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)]"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function BudgetCalculator({ items, lang, currency, rates, onBrowse }: {
  items: CatalogItem[]; lang: Lang; currency: Currency | ""; rates: Rates; onBrowse: (patch: { deal: DealKind; priceMax: string; rooms: number[]; districts: string[] }) => void;
}) {
  const t = T[lang];
  const [household, setHousehold] = useState<Household>("one");
  const [rooms, setRooms] = useState(1);
  const [area, setArea] = useState<Area>("middle");
  const [style, setStyle] = useState<Style>("budget");
  const [passport, setPassport] = useState<keyof typeof T.en.rules>("year");
  const show: Currency = currency || "USD";

  const rent = useMemo(() => {
    const inArea = (d: string | null) => (area === "centre" ? CENTRE.includes(d ?? "") : area === "middle" ? MIDDLE.includes(d ?? "") : !CENTRE.includes(d ?? "") && !MIDDLE.includes(d ?? ""));
    const list = items.filter((i) => i.kind === "rent" && !i.closed && i.usd && (rooms >= 3 ? (i.rooms ?? 0) >= 3 : i.rooms === rooms) && inArea(i.district)).map((i) => i.usd!);
    const m = median(list);
    return { usd: m ?? COSTS.rentUsd[rooms] * COSTS.areaFactor[area], count: m == null ? 0 : list.length };
  }, [items, rooms, area]);

  const adults = household === "one" ? 1 : 2;
  const kids = household === "family" ? 1.5 : 0;
  const gel = {
    rent: rent.usd * rates.USD,
    utilities: COSTS.utilities[rooms],
    internet: COSTS.internet + COSTS.mobile * adults,
    transport: COSTS.transport[style] * adults,
    groceries: COSTS.groceries[style] * (adults + kids * 0.6),
    eatingOut: COSTS.eatingOut[style] * adults,
    extras: COSTS.extras[style] * adults,
  };
  const total = Object.values(gel).reduce((a, b) => a + b, 0);
  const fmt = (v: number) => {
    const n = Math.round(convert(v, "GEL", show, rates) / 10) * 10;
    const s = n.toLocaleString("en-US").replace(/,/g, " ");
    return show === "GEL" || show === "RUB" ? `${s} ${CURRENCY_SIGN[show]}` : `${CURRENCY_SIGN[show]}${s}`;
  };
  const rows = (Object.keys(gel) as (keyof typeof gel)[]).map((k) => ({ key: k, value: gel[k] }));
  const districts = area === "centre" ? CENTRE : area === "middle" ? MIDDLE : [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">🧮 {t.title}</h2>
        <p className="mt-0.5 text-sm text-[var(--hint)]">{t.sub}</p>
      </div>
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-[var(--hint)]">{t.household}</div>
        <Choice value={household} onChange={setHousehold} options={[["one", t.one], ["couple", t.couple], ["family", t.family]]} />
      </div>
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-[var(--hint)]">{t.rooms}</div>
        <Choice value={rooms} onChange={setRooms} options={[[1, t.roomsN(1)], [2, t.roomsN(2)], [3, `${t.roomsN(3)}+`]]} />
      </div>
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-[var(--hint)]">{t.area}</div>
        <Choice value={area} onChange={setArea} options={[["centre", t.centre], ["middle", t.middle], ["outer", t.outer]]} />
      </div>
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-[var(--hint)]">{t.style}</div>
        <Choice value={style} onChange={setStyle} options={[["budget", t.budget], ["comfort", t.comfort]]} />
      </div>

      <section className="rounded-2xl bg-[var(--bg2)] p-3">
        {rows.map((r) => (
          <div key={r.key} className="py-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span>{t[r.key]}</span>
              <span className="font-semibold tabular-nums">{fmt(r.value)}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
              <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(3, (r.value / total) * 100)}%` }} />
            </div>
          </div>
        ))}
        <div className="mt-2 flex items-baseline justify-between border-t border-[var(--line)] pt-2">
          <span className="text-sm font-bold">{t.total}</span>
          <span className="text-xl font-extrabold text-[var(--accent)] tabular-nums">{fmt(total)}</span>
        </div>
        <p className="mt-1 text-[11px] text-[var(--hint)]">{rent.count ? t.fromListings(rent.count) : t.estimate}. {t.winter} {t.note}</p>
      </section>
      <button
        type="button"
        onClick={() => onBrowse({ deal: "rent", priceMax: String(Math.ceil((rent.usd * 1.15) / 50) * 50), rooms: rooms >= 3 ? [3, 4] : [rooms], districts })}
        className="w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white"
      >
        🔎 {t.seeFlats}
      </button>

      <section className="space-y-2 rounded-2xl border border-[var(--line)] p-3">
        <h3 className="text-sm font-bold">🛂 {t.visa}</h3>
        <label className="block">
          <span className="mb-1 block text-xs text-[var(--hint)]">{t.citizenship}</span>
          <select value={passport} onChange={(e) => setPassport(e.target.value as keyof typeof T.en.rules)} className="min-h-10 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 text-sm">
            {(Object.keys(t.countries) as (keyof typeof t.countries)[]).map((k) => <option key={k} value={k}>{t.countries[k]}</option>)}
          </select>
        </label>
        <p className="text-sm font-semibold">{t.rules[passport]}</p>
        <p className="text-xs text-[var(--hint)]">{t.longer}</p>
        <p className="text-[11px] text-[var(--hint)]">
          {t.check}{" "}
          <a href="https://www.geoconsul.gov.ge/" target="_blank" rel="noreferrer" className="font-semibold text-[var(--accent)] underline">geoconsul.gov.ge</a>
        </p>
      </section>
    </div>
  );
}
