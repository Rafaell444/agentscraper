import { prisma } from "./db";

export const SETTING_KEYS = [
  { key: "agency_name", label: "სააგენტოს სახელი", hint: "ჩანს საჯარო გვერდზე და პოსტებში" },
  { key: "agency_phone", label: "საკონტაქტო ტელეფონი", hint: "ნომერი, რომელიც იწერება ჩვენს პოსტებში და საჯარო გვერდზე" },
  { key: "agency_whatsapp", label: "WhatsApp ნომერი", hint: "საერთაშორისო ფორმატით, მაგ. 995599123456" },
  { key: "telegram_channel", label: "🇷🇺 Telegram არხი (რუსული)", hint: "@username ან -100... id; ბოტი არხის ადმინი უნდა იყოს. პოსტები რუსულად" },
  { key: "telegram_channel_en", label: "🇬🇧 Telegram არხი (ინგლისური)", hint: "@username — პოსტები ინგლისურად. ცარიელი = არ ვაქვეყნებთ" },
  { key: "telegram_channel_ka", label: "🇬🇪 Telegram არხი (ქართული)", hint: "არასავალდებულო. ცარიელი = არ ვაქვეყნებთ" },
  { key: "catalog_manager", label: "მენეჯერის Telegram", hint: "@username — მასთან წერენ კლიენტები არხიდან და აპიდან" },
  { key: "mini_app_link", label: "Mini App ბმული", hint: "მაგ. https://t.me/YourBot/app (BotFather → /newapp). ცარიელი = ჩვეულებრივი ვებ-ბმული" },
  { key: "facebook_page_id", label: "Facebook გვერდის ID", hint: "ციფრული ID; ტოკენი GitHub-ის სეკრეტშია" },
  { key: "public_base_url", label: "საჯარო გვერდის მისამართი", hint: "მაგ. https://crm.example.com — QR კოდისთვის" },
  { key: "public_intro_en", label: "საჯარო გვერდის ტექსტი (EN)", hint: "მოკლე შესავალი ინგლისურად" },
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number]["key"];

export async function getSettings(): Promise<Record<SettingKey, string>> {
  const rows = await prisma.setting.findMany();
  const result = Object.fromEntries(SETTING_KEYS.map((s) => [s.key, ""])) as Record<SettingKey, string>;
  for (const row of rows) if (row.key in result) result[row.key as SettingKey] = row.value;
  return result;
}
