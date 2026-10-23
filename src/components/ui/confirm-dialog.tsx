"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Destructive-action confirmation (AlertDialog pattern): focus stays inside, Escape and backdrop close it. */
export function ConfirmDialog({ title, children, confirmLabel, cancelLabel = "Keep it", onConfirm, onClose }: {
  title: string; children: ReactNode; confirmLabel: string; cancelLabel?: string; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="cd-title" onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl bg-surface p-5 shadow-xl">
        <h2 id="cd-title" className="text-lg font-semibold">{title}</h2>
        <div className="mt-2 text-sm text-muted">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} autoFocus>{cancelLabel}</Button>
          <Button variant="destructive" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
