// Apartment lease template, filled in from the listing and the client.
// Georgian, English, Russian, or Georgian + English side by side.

import type { Lang } from "./catalog";

export type LeaseData = {
  number: string;
  city: string;
  date: string;
  landlordName: string;
  landlordId: string;
  landlordPhone: string;
  tenantName: string;
  tenantId: string;
  tenantPhone: string;
  address: string;
  area: string;
  rooms: string;
  start: string;
  months: number;
  rent: string;
  currency: string;
  deposit: string;
  payDay: string;
  utilities: "tenant" | "landlord" | "split";
  pets: boolean;
  inventory: string;
  agency: string;
};

const blank = (value: string, width = 18) => value.trim() || "_".repeat(width);

/** "2026-11-01" + 12 months → "2027-10-31" (the day before the same date). */
export function endDate(start: string, months: number): string {
  const d = new Date(`${start}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || !months) return "";
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function fmt(date: string, lang: Lang): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (!date || Number.isNaN(d.getTime())) return "____.____.______";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return lang === "en" ? `${dd}/${mm}/${d.getUTCFullYear()}` : `${dd}.${mm}.${d.getUTCFullYear()}`;
}

const CURRENCY: Record<string, Record<Lang, string>> = {
  USD: { ka: "აშშ დოლარი", en: "US dollars", ru: "долларов США" },
  GEL: { ka: "ლარი", en: "Georgian lari", ru: "лари" },
  EUR: { ka: "ევრო", en: "euro", ru: "евро" },
};

export type LeaseText = { title: string; intro: string; clauses: { head: string; body: string }[]; landlord: string; tenant: string; signature: string; idLabel: string; phoneLabel: string };

export function leaseText(d: LeaseData, lang: Lang): LeaseText {
  const cur = CURRENCY[d.currency]?.[lang] ?? d.currency;
  const end = endDate(d.start, d.months);
  const who = {
    tenant: { ka: "დამქირავებელი", en: "the Tenant", ru: "Арендатор" },
    landlord: { ka: "გამქირავებელი", en: "the Landlord", ru: "Арендодатель" },
    split: { ka: "დამქირავებელი (კომუნალური მრიცხველების მიხედვით), ხოლო ბინის/კორპუსის მოსაკრებელს — გამქირავებელი", en: "the Tenant by the meters, while building fees are paid by the Landlord", ru: "Арендатор по счётчикам, а сборы за дом оплачивает Арендодатель" },
  }[d.utilities][lang];

  if (lang === "ka") {
    return {
      title: "ბინის ქირავნობის ხელშეკრულება",
      intro: `ქ. ${blank(d.city, 10)}, ${fmt(d.date, lang)}${d.number ? ` · № ${d.number}` : ""}\n\nერთი მხრივ, ${blank(d.landlordName, 28)} (პ/ნ ${blank(d.landlordId, 11)}) — შემდგომში „გამქირავებელი“, და მეორე მხრივ, ${blank(d.tenantName, 28)} (პ/ნ ან პასპორტი ${blank(d.tenantId, 11)}) — შემდგომში „დამქირავებელი“, ვდებთ შემდეგ ხელშეკრულებას:`,
      clauses: [
        { head: "1. ხელშეკრულების საგანი", body: `გამქირავებელი დამქირავებელს სარგებლობაში გადასცემს საცხოვრებელ ბინას მისამართზე: ${blank(d.address, 40)}${d.area ? `, ფართი ${d.area} მ²` : ""}${d.rooms ? `, ${d.rooms} ოთახი` : ""}, საცხოვრებლად.` },
        { head: "2. ვადა", body: `ხელშეკრულება მოქმედებს ${fmt(d.start, lang)}-დან ${fmt(end, lang)}-მდე (${d.months || "___"} თვე). მხარეთა შეთანხმებით ვადა შეიძლება გაგრძელდეს.` },
        { head: "3. ქირა და გადახდა", body: `ყოველთვიური ქირა: ${blank(d.rent, 8)} ${cur}. ქირა იხდება წინასწარ, ყოველი თვის ${blank(d.payDay, 3)} რიცხვამდე.` },
        { head: "4. დეპოზიტი", body: `დამქირავებელი იხდის დეპოზიტს: ${blank(d.deposit, 8)} ${cur}. დეპოზიტი ბრუნდება ხელშეკრულების დასრულებიდან 14 დღეში, გარდა დადასტურებული ზიანისა და გადაუხდელი გადასახადებისა.` },
        { head: "5. კომუნალური გადასახადები", body: `ელექტროენერგიას, გაზს, წყალს, ინტერნეტს და დასუფთავებას იხდის ${who}.` },
        { head: "6. ბინის მდგომარეობა და ინვენტარი", body: `ბინა გადაეცემა კარგ მდგომარეობაში${d.inventory ? `, შემდეგი ინვენტარით: ${d.inventory}` : ""}. დამქირავებელი ბინას აბრუნებს იმავე მდგომარეობაში, ბუნებრივი ცვეთის გათვალისწინებით.` },
        { head: "7. სარგებლობის წესი", body: `დამქირავებელი არ აქირავებს ბინას მესამე პირზე გამქირავებლის წერილობითი თანხმობის გარეშე. შინაური ცხოველები: ${d.pets ? "ნებადართულია" : "არ არის ნებადართული"}.` },
        { head: "8. შემოწმება", body: "გამქირავებელს შეუძლია ბინის დათვალიერება დამქირავებლის წინასწარი (მინიმუმ 24 საათით ადრე) გაფრთხილებით." },
        { head: "9. რემონტი", body: "მცირე, ყოველდღიური სარგებლობით გამოწვეულ შეკეთებას ახორციელებს დამქირავებელი. ძირითად შეკეთებას (კონსტრუქცია, წყალ-კანალიზაცია, გათბობა, ელექტროგაყვანილობა), რომელიც დამქირავებლის ბრალით არ არის გამოწვეული, ახორციელებს გამქირავებელი." },
        { head: "10. ვადამდე შეწყვეტა", body: "ნებისმიერ მხარეს შეუძლია ხელშეკრულების შეწყვეტა მეორე მხარის 30 დღით ადრე წერილობითი გაფრთხილებით. თუ დამქირავებელი ბინას ტოვებს გაფრთხილების გარეშე, დეპოზიტი რჩება გამქირავებელს." },
        { head: "11. დავები", body: "ხელშეკრულება რეგულირდება საქართველოს კანონმდებლობით. დავები წყდება მოლაპარაკებით, შეუთანხმებლობისას — თბილისის საქალაქო სასამართლოში." },
        { head: "12. დასკვნითი დებულებები", body: "ხელშეკრულება შედგენილია ორ ეგზემპლარად, თითო თითოეული მხარისთვის; ორივეს თანაბარი იურიდიული ძალა აქვს. ცვლილებები ძალაშია მხოლოდ წერილობით, ორივე მხარის ხელმოწერით." },
      ],
      landlord: "გამქირავებელი",
      tenant: "დამქირავებელი",
      signature: "ხელმოწერა",
      idLabel: "პ/ნ",
      phoneLabel: "ტელ.",
    };
  }
  if (lang === "ru") {
    return {
      title: "Договор аренды квартиры",
      intro: `г. ${blank(d.city, 10)}, ${fmt(d.date, lang)}${d.number ? ` · № ${d.number}` : ""}\n\n${blank(d.landlordName, 28)} (личный номер ${blank(d.landlordId, 11)}), далее «Арендодатель», с одной стороны, и ${blank(d.tenantName, 28)} (личный номер / паспорт ${blank(d.tenantId, 11)}), далее «Арендатор», с другой стороны, заключили настоящий договор:`,
      clauses: [
        { head: "1. Предмет договора", body: `Арендодатель передаёт Арендатору во временное пользование для проживания квартиру по адресу: ${blank(d.address, 40)}${d.area ? `, площадь ${d.area} м²` : ""}${d.rooms ? `, комнат: ${d.rooms}` : ""}.` },
        { head: "2. Срок", body: `Договор действует с ${fmt(d.start, lang)} по ${fmt(end, lang)} (${d.months || "___"} мес.). По соглашению сторон срок может быть продлён.` },
        { head: "3. Арендная плата", body: `Ежемесячная плата составляет ${blank(d.rent, 8)} ${cur}. Оплата вносится авансом до ${blank(d.payDay, 3)} числа каждого месяца.` },
        { head: "4. Депозит", body: `Арендатор вносит депозит в размере ${blank(d.deposit, 8)} ${cur}. Депозит возвращается в течение 14 дней после окончания договора за вычетом подтверждённого ущерба и неоплаченных счетов.` },
        { head: "5. Коммунальные услуги", body: `Электричество, газ, воду, интернет и уборку оплачивает ${who}.` },
        { head: "6. Состояние и имущество", body: `Квартира передаётся в хорошем состоянии${d.inventory ? ` со следующим имуществом: ${d.inventory}` : ""}. Арендатор возвращает её в том же состоянии с учётом естественного износа.` },
        { head: "7. Пользование", body: `Арендатор не сдаёт квартиру третьим лицам без письменного согласия Арендодателя. Домашние животные: ${d.pets ? "разрешены" : "не разрешены"}.` },
        { head: "8. Осмотр", body: "Арендодатель может осматривать квартиру, предупредив Арендатора не менее чем за 24 часа." },
        { head: "9. Ремонт", body: "Мелкий ремонт, вызванный повседневным использованием, выполняет Арендатор. Капитальный ремонт (конструкции, водопровод, отопление, электропроводка), возникший не по вине Арендатора, выполняет Арендодатель." },
        { head: "10. Досрочное расторжение", body: "Любая сторона может расторгнуть договор, письменно предупредив другую сторону за 30 дней. Если Арендатор съезжает без предупреждения, депозит остаётся у Арендодателя." },
        { head: "11. Споры", body: "Договор регулируется законодательством Грузии. Споры решаются переговорами, а при недостижении согласия — в Тбилисском городском суде." },
        { head: "12. Заключительные положения", body: "Договор составлен в двух экземплярах, по одному для каждой стороны, имеющих равную юридическую силу. Изменения действительны только в письменной форме за подписью обеих сторон." },
      ],
      landlord: "Арендодатель",
      tenant: "Арендатор",
      signature: "Подпись",
      idLabel: "Личный номер",
      phoneLabel: "Тел.",
    };
  }
  return {
    title: "Apartment Lease Agreement",
    intro: `${blank(d.city, 10)}, ${fmt(d.date, lang)}${d.number ? ` · No. ${d.number}` : ""}\n\nThis agreement is made between ${blank(d.landlordName, 28)} (personal ID ${blank(d.landlordId, 11)}), the "Landlord", and ${blank(d.tenantName, 28)} (personal ID / passport ${blank(d.tenantId, 11)}), the "Tenant":`,
    clauses: [
      { head: "1. Subject", body: `The Landlord lets to the Tenant, for living, the apartment at: ${blank(d.address, 40)}${d.area ? `, ${d.area} m²` : ""}${d.rooms ? `, ${d.rooms} rooms` : ""}.` },
      { head: "2. Term", body: `The lease runs from ${fmt(d.start, lang)} to ${fmt(end, lang)} (${d.months || "___"} months). The parties may extend it by agreement.` },
      { head: "3. Rent", body: `The monthly rent is ${blank(d.rent, 8)} ${cur}, paid in advance by day ${blank(d.payDay, 3)} of each month.` },
      { head: "4. Deposit", body: `The Tenant pays a deposit of ${blank(d.deposit, 8)} ${cur}. It is returned within 14 days after the lease ends, minus documented damage and unpaid bills.` },
      { head: "5. Utilities", body: `Electricity, gas, water, internet and cleaning are paid by ${who}.` },
      { head: "6. Condition and inventory", body: `The apartment is handed over in good condition${d.inventory ? ` with: ${d.inventory}` : ""}. The Tenant returns it in the same condition, normal wear and tear excepted.` },
      { head: "7. Use", body: `The Tenant does not sublet the apartment without the Landlord's written consent. Pets: ${d.pets ? "allowed" : "not allowed"}.` },
      { head: "8. Access", body: "The Landlord may inspect the apartment with at least 24 hours' notice to the Tenant." },
      { head: "9. Repairs", body: "The Tenant handles minor repairs caused by everyday use. The Landlord handles major repairs (structure, plumbing, heating, wiring) not caused by the Tenant." },
      { head: "10. Early termination", body: "Either party may end this agreement with 30 days' written notice. If the Tenant leaves without notice, the Landlord keeps the deposit." },
      { head: "11. Disputes", body: "This agreement is governed by the laws of Georgia. Disputes are settled by negotiation, or failing that by Tbilisi City Court." },
      { head: "12. Final provisions", body: "This agreement is made in two copies, one for each party, with equal legal force. Changes are valid only in writing, signed by both parties." },
    ],
    landlord: "Landlord",
    tenant: "Tenant",
    signature: "Signature",
    idLabel: "ID",
    phoneLabel: "Phone",
  };
}
