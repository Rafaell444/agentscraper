import Link from "next/link";
import type { Lang } from "@/lib/catalog";
import { SITE_TEXT } from "@/lib/site";

/** Brand bar of the public website with the language switch and the Telegram link. */
export function SiteHeader({ agency, lang, path, tgLink }: { agency: string; lang: Lang; path: string; tgLink: string }) {
  return (
    <header className="mb-4 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#0e2a4d] to-[#1d4f8c] px-4 py-3 text-white shadow-md">
      <Link href={`/flats${lang === "en" ? "" : `?lang=${lang}`}`} className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand-logo.jpg" alt={agency} className="h-full w-full scale-[1.22] object-cover" />
        </span>
        <span className="truncate text-base font-extrabold tracking-tight">{agency}</span>
      </Link>
      <nav className="flex rounded-lg bg-white/15 p-0.5 text-xs font-semibold" aria-label="Language">
        {(["en", "ru", "ka"] as Lang[]).map((l) => (
          <Link key={l} href={`${path}${l === "en" ? "" : `?lang=${l}`}`} hrefLang={l} className={`rounded-md px-2 py-1 ${l === lang ? "bg-white text-[#0e2a4d]" : "text-white/85"}`}>{l.toUpperCase()}</Link>
        ))}
      </nav>
      <a href={tgLink} className="hidden rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-[#0e2a4d] sm:block">✈️ {SITE_TEXT[lang].openTg}</a>
    </header>
  );
}
