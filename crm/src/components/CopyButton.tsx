"use client";

import { useState } from "react";

export function CopyButton({ value, label = "ბმულის კოპირება", className = "ui-btn ui-btn-secondary ui-btn-sm" }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          window.prompt("დააკოპირე ბმული:", value);
          return;
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? "✓ დაკოპირდა" : label}
    </button>
  );
}
