// Captions for Facebook (English), Instagram / Threads / TikTok (Russian):
// a hook first line picked from what is special about the flat, a short
// human intro, price, the facts, "why it is worth seeing", place and metro,
// the agent's own words, a clear call to action and hashtags.  The hook
// varies with the flat's number, so a feed of posts does not repeat itself.

import type { SharedPost } from "@prisma/client";
import { FEATURES, bedroomsWord, dealKind, descriptionFor, featureList, headline, placeName, priceText, termText, type Lang } from "./catalog";
import { metroName, metroNearby } from "./metro";

export type CopyNetwork = "fb" | "ig" | "tt" | "th";
type Post = SharedPost;

const pick = <T,>(list: T[], seed: number): T => list[Math.abs(seed) % list.length];

/** The first line: what makes this flat stand out, in a few words. */
export function hookLine(post: Post, lang: "en" | "ru"): string {
  const has = new Set(featureList(post.features));
  const kind = dealKind(post.dealType);
  const seed = post.refNo ?? 0;
  const metro = metroNearby(post.lat, post.lng, 15)[0];
  const place = placeName(post.district || post.location, lang);
  const ru = lang === "ru";
  const options: string[] = [];
  if (has.has("view")) options.push(ru ? "🏔 Просыпаться с видом на Тбилиси — каждый день" : "🏔 Wake up to a Tbilisi view every morning");
  if (has.has("terrace")) options.push(ru ? "🌿 Своя терраса — лучшее место для вечернего вина" : "🌿 Your own terrace for long Tbilisi evenings");
  if (has.has("balcony") && !has.has("terrace")) options.push(ru ? "🌇 Балкон для утреннего кофе уже ждёт вас" : "🌇 A balcony made for your morning coffee");
  if (has.has("newbuild")) options.push(ru ? "✨ Новостройка, где всё уже готово к жизни" : "✨ A new building, ready to move in");
  if (has.has("pool") || has.has("gym")) options.push(ru ? "🏊 Бассейн и спортзал — прямо в вашем доме" : "🏊 Pool and gym right in your building");
  if (has.has("furniture") && has.has("appliances")) options.push(ru ? "🧳 Заезжайте с одним чемоданом — всё уже есть" : "🧳 Move in with just a suitcase — it's all here");
  if (post.pets === "yes") options.push(ru ? "🐾 Квартира, где рады вашему питомцу" : "🐾 Pets welcome — bring the whole family");
  if (metro && metro.minutes <= 8) options.push(ru ? `🚇 ${metro.minutes} мин пешком до метро «${metroName(metro.id, "ru")}»` : `🚇 Just ${metro.minutes} min walk to ${metroName(metro.id, "en")} metro`);
  if (has.has("fireplace")) options.push(ru ? "🪵 Камин, уют и зимние вечера в Тбилиси" : "🪵 A fireplace for cozy Tbilisi winters");
  if (!options.length) {
    options.push(
      kind === "sale"
        ? ru ? `🔑 Своя квартира в ${place || "Тбилиси"} — проще, чем кажется` : `🔑 Your own home in ${place || "Tbilisi"} is closer than you think`
        : ru ? `🏠 ${headline(post, "ru")} — посмотрите, пока её не сняли` : `🏠 ${headline(post, "en")} — see it before it's gone`,
    );
  }
  return pick(options, seed);
}

/** "2-room flat, 65 m², 3rd of 9 floors, in Vake." in a sentence. */
function introLine(post: Post, lang: "en" | "ru"): string {
  const place = placeName(post.location || post.district, lang);
  const kind = dealKind(post.dealType);
  if (lang === "ru") {
    const what = `${post.rooms ? `${post.rooms}-комнатная ` : ""}квартира${post.area ? ` ${post.area} м²` : ""}`;
    const where = place ? ` в районе ${place}` : " в Тбилиси";
    const floor = post.floor ? `, ${post.floor}${post.totalFloors ? ` из ${post.totalFloors}` : ""} этаж` : "";
    const verb = kind === "sale" ? "Продаётся" : kind === "daily" ? "Посуточно —" : "Сдаётся";
    return `${verb} ${what}${where}${floor}.`;
  }
  const what = `${post.rooms ? `${post.rooms}-room ` : ""}apartment${post.area ? ` of ${post.area} m²` : ""}`;
  const where = place ? ` in ${place}` : " in Tbilisi";
  const floor = post.floor ? `, floor ${post.floor}${post.totalFloors ? ` of ${post.totalFloors}` : ""}` : "";
  const verb = kind === "sale" ? "For sale:" : kind === "daily" ? "Daily rent:" : "For rent:";
  return `${verb} a ${what}${where}${floor}.`;
}

function factsLines(post: Post, lang: "en" | "ru"): string[] {
  const ru = lang === "ru";
  return [
    post.rooms ? `🛏 ${post.rooms} ${ru ? "комн." : post.rooms === 1 ? "room" : "rooms"}${post.bedrooms ? ` · ${post.bedrooms} ${bedroomsWord(post.bedrooms, lang)}` : ""}` : "",
    post.area ? `📐 ${post.area} ${ru ? "м²" : "m²"}` : "",
    post.floor ? `🏢 ${post.floor}${post.totalFloors ? `/${post.totalFloors}` : ""} ${ru ? "этаж" : "floor"}` : "",
    post.bathrooms ? `🛁 ${post.bathrooms} ${ru ? "с/у" : post.bathrooms === 1 ? "bathroom" : "bathrooms"}` : "",
  ].filter(Boolean);
}

function featureLines(post: Post, lang: "en" | "ru", max: number): string[] {
  return featureList(post.features)
    .map((k) => FEATURES.find((f) => f.key === k))
    .filter((f): f is (typeof FEATURES)[number] => Boolean(f))
    .slice(0, max)
    .map((f) => `${f.emoji} ${f[lang]}`);
}

function placeLines(post: Post, lang: "en" | "ru"): string[] {
  const place = placeName(post.location || post.district, lang);
  const near = metroNearby(post.lat, post.lng, 15)[0];
  return [
    place ? `📍 ${place}${lang === "ru" ? ", Тбилиси" : ", Tbilisi"}` : "",
    near ? `🚇 ${metroName(near.id, lang)} · ${near.minutes} ${lang === "ru" ? "мин пешком" : "min walk"}` : "",
  ].filter(Boolean);
}

function trimTo(text: string, max: number): string {
  const clean = text.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

const TAGS = {
  ru: { rent: ["арендатбилиси", "квартиравтбилиси", "сниматьквартиру"], sale: ["недвижимостьтбилиси", "купитьквартиру", "квартиравтбилиси"], daily: ["посуточнотбилиси", "квартиравтбилиси"] },
  en: { rent: ["TbilisiRent", "ApartmentForRent"], sale: ["TbilisiRealEstate", "ApartmentForSale"], daily: ["TbilisiStay", "ShortTermRental"] },
};

function hashtags(post: Post, lang: "en" | "ru", network: CopyNetwork): string {
  const kind = dealKind(post.dealType);
  const base = lang === "ru" ? ["тбилиси", "грузия", "жизньвгрузии", "переездвгрузию"] : ["Tbilisi", "Georgia", "LivingInGeorgia"];
  const district = placeName(post.district, lang).replace(/[\s-]+/g, "");
  const tags = [...TAGS[lang][kind], ...(district ? [district.toLowerCase()] : []), ...base, ...(lang === "ru" ? ["tbilisi", "georgia"] : [])];
  const max = network === "ig" ? 14 : network === "tt" ? 6 : 4;
  return [...new Set(tags)].slice(0, max).map((t) => `#${t}`).join(" ");
}

/** The full caption for one network (Facebook: English, the others: Russian). */
export function socialCaption(post: Post, network: CopyNetwork, link: string): string {
  const lang: "en" | "ru" = network === "fb" ? "en" : "ru";
  const ru = lang === "ru";
  const kind = dealKind(post.dealType);
  const price = priceText(post.price, post.currency, kind, lang);
  const features = featureLines(post, lang, network === "tt" ? 4 : 8);
  const extras = [
    post.pets === "yes" ? (ru ? "🐾 Можно с животными" : "🐾 Pets allowed") : post.pets === "ask" ? (ru ? "🐾 Животные — по договорённости" : "🐾 Pets by agreement") : "",
    post.leaseTerm && kind === "rent" ? `🕐 ${ru ? "Срок аренды" : "Lease"}: ${termText(post.leaseTerm, lang)}` : "",
  ].filter(Boolean);
  const id = post.refNo ? `ID ${post.refNo}` : "";
  const cta = ru
    ? `📩 Напишите нам${id ? ` «${id}»` : ""} — покажем квартиру и ответим на все вопросы. Без лишних звонков, всё в мессенджере.`
    : `📩 Message us${id ? ` “${id}”` : ""} to book a viewing — we'll show you around and answer every question.`;
  const linkLine =
    network === "ig"
      ? `🔗 Все фото, карта и детали — по ссылке в шапке профиля${id ? ` (${id})` : ""}`
      : ru ? `👉 Все фото, карта и детали: ${link}` : `👉 All photos, map and details: ${link}`;
  const story = descriptionFor(post, lang);
  const storyMax = network === "tt" ? 500 : network === "ig" ? 700 : 900;

  const blocks = [
    hookLine(post, lang),
    introLine(post, lang),
    `💰 ${price}`,
    factsLines(post, lang).join("\n"),
    features.length ? `${ru ? "Почему стоит посмотреть:" : "Why you'll love it:"}\n${features.join("\n")}` : "",
    [...placeLines(post, lang), ...extras].join("\n"),
    story ? trimTo(story, storyMax) : "",
    cta,
    linkLine,
    hashtags(post, lang, network),
  ].filter(Boolean);
  const text = blocks.join("\n\n");
  return network === "ig" ? text.slice(0, 2200) : text.slice(0, 4000);
}

/** TikTok's title (up to 90 characters): the hook, in Russian. */
export function tiktokTitle(post: Post): string {
  return hookLine(post, "ru").slice(0, 90);
}
