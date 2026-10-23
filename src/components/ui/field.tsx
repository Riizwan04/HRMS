import clsx from "clsx";
import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";

/** Shared input styling: 16px text (no iOS zoom), 44px height, >= 3:1 border (DESIGN.md 2.1/2.5). */
export const inputCls =
  "w-full rounded-lg border border-input bg-surface px-3 text-base text-text placeholder:text-muted/70 h-11 disabled:opacity-60";
export const textareaCls = "w-full rounded-lg border border-input bg-surface px-3 py-2 text-base text-text min-h-24";

/** Label above, hint below, error = icon + text (never colour alone), wired with aria-describedby. */
export function Field({ id, label, required, hint, error, children }: {
  id: string; label: string; required?: boolean; hint?: string; error?: string | null; children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}{required && <span className="text-danger" aria-hidden> *</span>}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className={clsx("flex items-start gap-1.5 text-sm text-danger")}>
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}
