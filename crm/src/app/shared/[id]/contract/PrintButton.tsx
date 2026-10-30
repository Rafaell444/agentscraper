"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="ui-btn ui-btn-primary">
      ⬇ PDF / ბეჭდვა
    </button>
  );
}
