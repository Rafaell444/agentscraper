/** Plain public page for the Terms and Privacy texts (the TikTok and Meta app settings link here). */
export function LegalPage({ title, updated, sections }: { title: string; updated: string; sections: { head: string; body: string }[] }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-gray-800">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <p className="mt-1 text-sm text-gray-500">Tbilisi Home: Buy &amp; Rent · last updated {updated}</p>
      {sections.map((s) => (
        <section key={s.head} className="mt-6">
          <h2 className="text-base font-semibold text-gray-900">{s.head}</h2>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{s.body}</p>
        </section>
      ))}
    </main>
  );
}
