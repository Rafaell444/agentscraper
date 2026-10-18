"use client";

import { useFormStatus } from "react-dom";

/** Submit button that shows a waiting label while the server action runs.
 * `formAction` runs a different server action with the same form fields. */
export function SubmitButton({
  children,
  pending,
  className = "ui-btn ui-btn-primary",
  formAction,
  confirm,
}: {
  children: React.ReactNode;
  pending: string;
  className?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
  confirm?: string;
}) {
  const status = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={status.pending}
      formAction={formAction}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {status.pending ? pending : children}
    </button>
  );
}
