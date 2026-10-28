import type { AlertRule, TelegramRecipient } from "@prisma/client";
import type { FilterOptions } from "@/lib/queries";
import { csv } from "@/lib/alerts";
import { Input } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { saveRule } from "./actions";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</legend>
      {children}
    </fieldset>
  );
}

function Check({ name, value, label, checked }: { name: string; value: string; label: string; checked: boolean }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-sm has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50 has-[:checked]:text-emerald-800">
      <input type="checkbox" name={name} value={value} defaultChecked={checked} className="accent-emerald-600" />
      {label}
    </label>
  );
}

/** Create / edit form for one alert rule.  Empty groups mean "any". */
export function RuleForm({ rule, options, recipients }: { rule?: AlertRule; options: FilterOptions; recipients: TelegramRecipient[] }) {
  const has = (field: string | undefined, value: string) => csv(field).includes(value);
  return (
    <form action={saveRule} className="space-y-4">
      {rule ? <input type="hidden" name="id" value={rule.id} /> : null}
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-600">სახელი</span>
        <Input name="name" defaultValue={rule?.name ?? ""} placeholder="მაგ. ვაკე, 2 ოთახიანი ქირა, მესაკუთრე" />
      </label>

      <Section title="ვის მივიდეს (Telegram)">
        {recipients.length ? (
          <div className="flex flex-wrap gap-1.5">
            {recipients.map((r) => (
              <Check key={r.id} name="recipientIds" value={r.id} label={`${r.name}${r.chatId ? "" : " (არ არის დაკავშირებული)"}`} checked={rule ? has(rule.recipientIds, r.id) : Boolean(r.chatId)} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-amber-700">ჯერ დაამატე მიმღები ზემოთ, ბლოკში „Telegram მიმღებები“.</p>
        )}
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="გარიგება (ცარიელი = ყველა)">
          <div className="flex flex-wrap gap-1.5">
            {options.deals.map((v) => <Check key={v} name="dealTypes" value={v} label={v} checked={has(rule?.dealTypes, v)} />)}
          </div>
        </Section>
        <Section title="ქონების ტიპი (ცარიელი = ყველა)">
          <div className="flex flex-wrap gap-1.5">
            {options.types.map((v) => <Check key={v} name="propertyTypes" value={v} label={v} checked={has(rule?.propertyTypes, v)} />)}
          </div>
        </Section>
      </div>

      <Section title="რაიონი / უბანი (ცარიელი = ყველა)">
        <div className="space-y-1">
          {options.districts.filter((d) => d.name).map((district) => {
            const neighbourhoods = options.neighbourhoodsByDistrict[district.name] ?? [];
            const open = has(rule?.areas, district.name) || neighbourhoods.some((n) => has(rule?.areas, n));
            return (
              <details key={district.name} open={open} className="rounded-lg border border-gray-200 bg-gray-50/60 px-2 py-1.5">
                <summary className="cursor-pointer text-sm font-medium text-gray-800">{district.name} <span className="text-xs text-gray-400">{district.count}</span></summary>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Check name="areas" value={district.name} label={`მთელი ${district.name}`} checked={has(rule?.areas, district.name)} />
                  {neighbourhoods.map((n) => <Check key={n} name="areas" value={n} label={n} checked={has(rule?.areas, n)} />)}
                </div>
              </details>
            );
          })}
        </div>
      </Section>

      <div className="grid gap-4 sm:grid-cols-3">
        <Section title="ფასი, $">
          <div className="flex gap-2">
            <Input name="priceMin" defaultValue={rule?.priceMin ?? ""} placeholder="დან" inputMode="numeric" />
            <Input name="priceMax" defaultValue={rule?.priceMax ?? ""} placeholder="მდე" inputMode="numeric" />
          </div>
        </Section>
        <Section title="ფართი, მ²">
          <div className="flex gap-2">
            <Input name="areaMin" defaultValue={rule?.areaMin ?? ""} placeholder="დან" inputMode="numeric" />
            <Input name="areaMax" defaultValue={rule?.areaMax ?? ""} placeholder="მდე" inputMode="numeric" />
          </div>
        </Section>
        <Section title="ოთახები">
          <div className="flex gap-2">
            <Input name="roomsMin" defaultValue={rule?.roomsMin ?? ""} placeholder="დან" inputMode="numeric" />
            <Input name="roomsMax" defaultValue={rule?.roomsMax ?? ""} placeholder="მდე" inputMode="numeric" />
          </div>
        </Section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="ვინ დადო">
          <div className="flex flex-wrap gap-1.5">
            {[["", "ყველა"], ["owner", "მხოლოდ მესაკუთრე"], ["agent", "მხოლოდ აგენტი"]].map(([value, label]) => (
              <label key={value} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-sm has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50 has-[:checked]:text-emerald-800">
                <input type="radio" name="posterKind" value={value} defaultChecked={(rule?.posterKind ?? "") === value} className="accent-emerald-600" />
                {label}
              </label>
            ))}
          </div>
        </Section>
        <Section title="საიტები (ცარიელი = ყველა)">
          <div className="flex flex-wrap gap-1.5">
            {options.sites.map((s) => <Check key={s.value} name="sites" value={s.value} label={s.label} checked={has(rule?.sites, s.value)} />)}
          </div>
        </Section>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-600">სიტყვები ტექსტში (მძიმით, ერთ-ერთი მაინც): მაგ. აივანი, პარკინგი, ცხოველები</span>
        <Input name="keywords" defaultValue={csv(rule?.keywords).join(", ")} />
      </label>

      <SubmitButton pending="ინახება…">{rule ? "შენახვა" : "ფილტრის შექმნა"}</SubmitButton>
    </form>
  );
}
