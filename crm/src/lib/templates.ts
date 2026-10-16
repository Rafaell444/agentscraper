/** One-tap WhatsApp message templates. Placeholders: {name} {agent} {agency} {phone} {listing} {price} {area} {time} {address} {link} */

export type Lang = "ka" | "en" | "ru";
export const LANGS: { value: Lang; label: string }[] = [
  { value: "ka", label: "KA" },
  { value: "en", label: "EN" },
  { value: "ru", label: "RU" },
];

export type TemplateKind = "owner_first" | "owner_followup" | "client_first" | "viewing_confirm" | "client_followup" | "client_card";

export const TEMPLATE_LABELS: Record<TemplateKind, string> = {
  owner_first: "მესაკუთრეს: პირველი კონტაქტი",
  owner_followup: "მესაკუთრეს: შეხსენება",
  client_first: "კლიენტს: პირველი კონტაქტი",
  viewing_confirm: "კლიენტს: დათვალიერების დადასტურება",
  client_followup: "კლიენტს: შეხსენება",
  client_card: "კლიენტს: განცხადების ბარათი",
};

const T: Record<TemplateKind, Record<Lang, string>> = {
  owner_first: {
    ka: "გამარჯობა! მე ვარ {agent}, სააგენტო {agency}. ვნახე თქვენი განცხადება ({listing}, {price}). გვყავს მყიდველები/მდგმურები ამ უბანზე — შეგვიძლია უფასოდ ვაჩვენოთ და სწრაფად მოვძებნოთ კლიენტი. მოგწერთ დეტალებს ან დაგირეკოთ?",
    en: "Hello! I'm {agent} from {agency}. I saw your listing ({listing}, {price}). We have clients looking in this area and can bring them for viewings at no cost to you. May I send details or call you?",
    ru: "Здравствуйте! Я {agent}, агентство {agency}. Увидел(а) ваше объявление ({listing}, {price}). У нас есть клиенты на этот район — можем бесплатно показывать и быстро найти покупателя/арендатора. Написать детали или позвонить?",
  },
  owner_followup: {
    ka: "გამარჯობა, {agent} ვარ ({agency}). თქვენი {listing} ჯერ აქტუალურია? გვაქვს დაინტერესებული კლიენტი და გვინდა დათვალიერება შევათანხმოთ.",
    en: "Hello, it's {agent} ({agency}). Is your {listing} still available? We have an interested client and would like to arrange a viewing.",
    ru: "Здравствуйте, это {agent} ({agency}). Ваш объект ({listing}) ещё актуален? У нас есть заинтересованный клиент, хотим договориться о просмотре.",
  },
  client_first: {
    ka: "გამარჯობა {name}! {agent} ვარ, {agency}. მივიღე თქვენი მოთხოვნა — შევარჩევ ვარიანტებს და დღესვე გამოგიგზავნით. რომელ დროს გაწყობთ დათვალიერება?",
    en: "Hello {name}! This is {agent} from {agency}. I received your request and will send you matching options today. What time suits you for viewings?",
    ru: "Здравствуйте, {name}! Это {agent}, {agency}. Получил(а) ваш запрос — подберу варианты и отправлю сегодня. В какое время вам удобны просмотры?",
  },
  viewing_confirm: {
    ka: "{name}, ვადასტურებ დათვალიერებას: {time}, მისამართი {address} ({listing}, {price}). მე ვარ {agent}, ტელ. {phone}. შეგხვდებით შესასვლელთან.",
    en: "{name}, confirming the viewing: {time}, address {address} ({listing}, {price}). I'm {agent}, phone {phone}. I'll meet you at the entrance.",
    ru: "{name}, подтверждаю просмотр: {time}, адрес {address} ({listing}, {price}). Я {agent}, тел. {phone}. Встречу вас у входа.",
  },
  client_followup: {
    ka: "{name}, გამარჯობა, {agent} ვარ ({agency}). როგორ მოგეწონათ ნანახი ვარიანტები? თუ რამე შევცვალო მოთხოვნებში, მითხარით — ახალი განცხადებები ყოველდღე შემოდის.",
    en: "Hi {name}, it's {agent} ({agency}). What did you think of the options you saw? Tell me if your requirements changed — new listings come in every day.",
    ru: "{name}, здравствуйте, это {agent} ({agency}). Как вам просмотренные варианты? Если изменились требования — скажите, новые объявления появляются каждый день.",
  },
  client_card: {
    ka: "{name}, ნახეთ ეს ვარიანტი: {listing}, {price}, {area}. დეტალები და ფოტო: {link}. მოგწონთ? დავგეგმოთ დათვალიერება.",
    en: "{name}, have a look at this one: {listing}, {price}, {area}. Details and photo: {link}. Interested? Let's schedule a viewing.",
    ru: "{name}, посмотрите этот вариант: {listing}, {price}, {area}. Детали и фото: {link}. Нравится? Давайте назначим просмотр.",
  },
};

export function renderTemplate(kind: TemplateKind, lang: Lang, values: Record<string, string>): string {
  let text = T[kind][lang];
  for (const [key, value] of Object.entries(values)) text = text.split(`{${key}}`).join(value || "—");
  return text.replace(/\{[a-z]+\}/g, "—");
}

export function waLink(phone: string | null | undefined, text: string): string {
  const digits = (phone ?? "").split(";")[0].replace(/[^\d]/g, "");
  if (!digits) return "";
  const number = digits.startsWith("995") ? digits : `995${digits}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
