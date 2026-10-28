import type { SegmentFilters } from "@/lib/segments";

function Chip({ name, value, label, checked, type = "checkbox" }: { name: string; value: string; label: string; checked: boolean; type?: "checkbox" | "radio" }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-sm has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50 has-[:checked]:text-emerald-800">
      <input type={type} name={name} value={value} defaultChecked={checked} className="accent-emerald-600" />
      {label}
    </label>
  );
}

function NumberBox({ name, label, value, placeholder }: { name: string; label: string; value?: number; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <input name={name} defaultValue={value ?? ""} placeholder={placeholder} inputMode="numeric" className="ui-field" />
    </label>
  );
}

/** Adjustable filters for an audience page (expats, students, ...); a plain GET form. */
export function SegmentFilterForm({ slug, filters, segmentAreas, otherAreas, deals, types }: { slug: string; filters: SegmentFilters; segmentAreas: string[]; otherAreas: string[]; deals: string[]; types: string[] }) {
  return (
    <form action={`/segments/${slug}`} className="ui-card space-y-3 p-4">
      <input type="hidden" name="f" value="1" />
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <span className="mb-1 block text-xs font-medium text-gray-600">გარიგება</span>
          <div className="flex flex-wrap gap-1.5">
            {deals.map((deal) => <Chip key={deal} type="radio" name="deal" value={deal} label={deal} checked={filters.deal === deal} />)}
          </div>
        </div>
        <div>
          <span className="mb-1 block text-xs font-medium text-gray-600">ტიპი</span>
          <div className="flex flex-wrap gap-1.5">
            <Chip type="radio" name="type" value="" label="ყველა" checked={!filters.type} />
            {types.map((type) => <Chip key={type} type="radio" name="type" value={type} label={type} checked={filters.type === type} />)}
          </div>
        </div>
      </div>
      <div>
        <span className="mb-1 block text-xs font-medium text-gray-600">უბნები</span>
        <div className="flex flex-wrap gap-1.5">
          {segmentAreas.map((area) => <Chip key={area} name="areas" value={area} label={area} checked={filters.areas.includes(area)} />)}
        </div>
        {otherAreas.length ? (
          <details className="mt-1.5" open={otherAreas.some((a) => filters.areas.includes(a))}>
            <summary className="cursor-pointer text-xs text-gray-500">სხვა უბნები</summary>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {otherAreas.map((area) => <Chip key={area} name="areas" value={area} label={area} checked={filters.areas.includes(area)} />)}
            </div>
          </details>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <NumberBox name="priceMin" label="ფასი დან, $" value={filters.priceMin} />
        <NumberBox name="priceMax" label="ფასი მდე, $" value={filters.priceMax} />
        <NumberBox name="roomsMin" label="ოთახი მინ." value={filters.roomsMin} />
        <NumberBox name="areaMin" label="ფართი მინ., მ²" value={filters.areaMin} />
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600">დამატებული</span>
          <select name="days" defaultValue={filters.days ?? ""} className="ui-select">
            <option value="">ნებისმიერ დროს</option>
            <option value="1">ბოლო 24 სთ</option>
            <option value="3">ბოლო 3 დღე</option>
            <option value="7">ბოლო კვირა</option>
            <option value="30">ბოლო თვე</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip name="owner" value="1" label="მხოლოდ მესაკუთრე" checked={filters.owner} />
        <button type="submit" className="ui-btn ui-btn-primary ui-btn-sm ml-auto">ფილტრი</button>
        <a href={`/segments/${slug}`} className="ui-btn ui-btn-ghost ui-btn-sm">საწყისი</a>
      </div>
    </form>
  );
}
