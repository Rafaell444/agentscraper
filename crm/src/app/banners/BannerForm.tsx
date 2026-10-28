"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadPhotos } from "@/lib/resizeImage";
import { PhoneField } from "@/components/PhoneMatches";
import { BANNER_DEALS as DEALS, BANNER_TYPES as TYPES } from "@/lib/banners";
import { createBanner } from "./actions";


function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{text}</span>
      {children}
    </label>
  );
}

/** New street banner: works one-handed on a phone (photo, location, number). */
export function BannerForm({ districts }: { districts: string[] }) {
  const router = useRouter();
  const photos = useRef<HTMLInputElement>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [count, setCount] = useState(0);

  function locate() {
    if (!navigator.geolocation) return setError("ამ ტელეფონზე მდებარეობა მიუწვდომელია");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating(false);
      },
      () => {
        setError("მდებარეობა ვერ მივიღე — ნება დართე ბრაუზერს");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy("ინახება…");
    const result = await createBanner(new FormData(event.currentTarget));
    if ("error" in result) {
      setError(result.error);
      setBusy("");
      return;
    }
    const files = Array.from(photos.current?.files ?? []);
    if (files.length) await uploadPhotos(`/api/banners/${result.id}/photos`, files, (done, total) => setBusy(`ფოტოები ${Math.min(done + 1, total)} / ${total}…`));
    router.push(`/banners/${result.id}?saved=1`);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Label text="მისამართი">
          <input name="address" className="ui-field" placeholder="მაგ. ჭავჭავაძის გამზ. 37" />
        </Label>
        <Label text="რაიონი">
          <input name="district" className="ui-field" list="banner-districts" placeholder="მაგ. ვაკე" />
        </Label>
        <Label text="ტელეფონი (ბანერიდან)">
          <PhoneField />
        </Label>
        <Label text="გარიგება">
          <select name="dealType" className="ui-select" defaultValue="იყიდება">
            {DEALS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Label>
        <Label text="ქონების ტიპი">
          <select name="propertyType" className="ui-select" defaultValue="ბინა">
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Label>
        <Label text="ფასი, $ (თუ წერია)">
          <input name="price" className="ui-field" inputMode="numeric" />
        </Label>
        <Label text="მესაკუთრის სახელი (თუ იცი)">
          <input name="ownerName" className="ui-field" />
        </Label>
        <div className="sm:col-span-2">
          <Label text="კომენტარი">
            <textarea name="comment" rows={2} className="ui-field" placeholder="მაგ. მე-5 სართული, აივნიდან ჩამოკიდებული, ახალი რემონტი" />
          </Label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input ref={photos} type="file" accept="image/*" multiple className="hidden" onChange={(e) => setCount(e.target.files?.length ?? 0)} />
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => photos.current?.click()}>📷 ფოტო {count ? `(${count})` : ""}</button>
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={locate} disabled={locating}>
          📍 {locating ? "იძებნება…" : coords ? "მდებარეობა აღებულია ✓" : "ჩემი მდებარეობა"}
        </button>
        {coords ? (
          <>
            <input type="hidden" name="lat" value={coords.lat} />
            <input type="hidden" name="lng" value={coords.lng} />
          </>
        ) : null}
        <button type="submit" className="ui-btn ui-btn-primary ml-auto" disabled={Boolean(busy)}>{busy || "ბანერის შენახვა"}</button>
      </div>
      {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
      <datalist id="banner-districts">{districts.map((d) => <option key={d} value={d} />)}</datalist>
    </form>
  );
}
