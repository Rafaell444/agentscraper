"use client";

import { useState } from "react";
import { LANGS, TEMPLATE_LABELS, renderTemplate, waLink, type Lang, type TemplateKind } from "@/lib/templates";

/** Buttons that open WhatsApp with a filled-in template. */
export function WaTemplates({ phone, kinds, values, compact = false }: { phone: string | null | undefined; kinds: TemplateKind[]; values: Record<string, string>; compact?: boolean }) {
  const [lang, setLang] = useState<Lang>("ka");
  if (!phone) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500">WhatsApp შაბლონი:</span>
        {LANGS.map((l) => (
          <button key={l.value} type="button" onClick={() => setLang(l.value)} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${lang === l.value ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600"}`}>
            {l.label}
          </button>
        ))}
      </div>
      <div className={`flex flex-wrap gap-1 ${compact ? "" : ""}`}>
        {kinds.map((kind) => {
          const text = renderTemplate(kind, lang, values);
          return (
            <a key={kind} href={waLink(phone, text)} target="_blank" rel="noreferrer" title={text} className="ui-chip">
              💬 {TEMPLATE_LABELS[kind].split(": ")[1] ?? TEMPLATE_LABELS[kind]}
            </a>
          );
        })}
      </div>
    </div>
  );
}
