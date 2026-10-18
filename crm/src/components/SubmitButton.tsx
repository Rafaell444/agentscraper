"use client";

import { useFormStatus } from "react-dom";

/** Submit button that shows a waiting label while the server action runs. */
export function SubmitButton({
  children,
  pending,
  className = "ui-btn ui-btn-primary",
  name,
  value,
  confirm,
}: {
  children: React.ReactNode;
  pending: string;
  className?: string;
  name?: string;
  value?: string;
  confirm?: string;
}) {
  const status = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={status.pending}
      name={name}
      value={value}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {status.pending ? pending : children}
    </button>
  );
}
