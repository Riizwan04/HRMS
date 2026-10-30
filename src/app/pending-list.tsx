"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cancelRequest } from "@/modules/attendance/actions";
import { cancelLeave } from "@/modules/leave/actions";

export type PendingRow = { id: string; kind: "Leave" | "WFH" | "Regularisation" | "Optional holiday"; text: string };
const KEY = { WFH: "wfh", Regularisation: "regularisation", "Optional holiday": "optional_holiday" } as const;

/** My pending requests with a real Cancel (leave uses cancel_leave, the others cancel_request). */
export function PendingList({ rows }: { rows: PendingRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const cancel = (r: PendingRow) => {
    setError(null);
    startTransition(async () => {
      try {
        if (r.kind === "Leave") { await cancelLeave({ id: r.id }); router.refresh(); return; }
        const res = await cancelRequest({ kind: KEY[r.kind], id: r.id });
        if (res.ok) router.refresh(); else setError(res.error);
      } catch { setError("This request can't be cancelled any more"); }
    });
  };
  if (rows.length === 0) return <p className="px-4 py-6 text-center text-sm text-muted">Nothing pending. Requests you make will show here until they are decided.</p>;
  return (
    <>
      {error && <p role="alert" className="px-4 py-3 text-sm text-danger">{error}</p>}
      {rows.map((p) => (
        <div key={`${p.kind}-${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm"><span className="mr-2 rounded-full border border-dashed border-input px-2 py-0.5 text-xs font-semibold">{p.kind}</span>{p.text}</p>
          <Button size="sm" variant="ghost" onClick={() => cancel(p)}>Cancel</Button>
        </div>
      ))}
    </>
  );
}
