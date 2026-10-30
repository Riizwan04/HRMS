"use client";

import { Clock, Home } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import type { DayRow } from "@/lib/attendance-types";
import { formatTimeIST } from "@/lib/time/ist";
import { checkIn, checkOut, requestWfh } from "@/modules/attendance/actions";

const hm = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} m`;

/** Today's card on the dashboard, driven by day_status() for today and the real check_in()/check_out() functions. */
export function CheckInLive({ today, date }: { today: DayRow; date: string }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [wfhOpen, setWfhOpen] = useState(false);
  const [reason, setReason] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null); setNote(null);
    startTransition(async () => { const r = await fn(); if (!r.ok) setError(r.error ?? "Something went wrong"); else router.refresh(); });
  };
  const off = today.status === "weekly_off" || today.status === "holiday" || today.status === "on_leave";
  const open = today.status === "in_progress";
  const closed = today.check_out !== null;

  return (
    <Card className="min-w-0">
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">Today</h2>
          {today.status === "pending" && <span className="rounded-full bg-bg px-2.5 py-1 text-xs font-semibold text-muted">Not checked in</span>}
          {open && <span className="rounded-full bg-bg px-2.5 py-1 text-xs font-semibold text-muted">Checked in</span>}
          {(today.status === "present" || today.status === "half_day") && <StatusBadge status={today.status} wfh={today.is_wfh} />}
          {off && <StatusBadge status={today.status as "weekly_off" | "holiday" | "on_leave"} />}
          {today.is_late && <StatusBadge status="late" />}
        </div>
        {today.off_name && <p className="text-sm text-muted">{today.off_name}</p>}
        {today.check_in && <p className="flex items-center gap-1.5 text-sm text-muted"><Clock className="size-4" aria-hidden /> Checked in {formatTimeIST(today.check_in)} IST</p>}
        {closed && today.worked_minutes !== null && <p className="text-sm text-muted">Worked {hm(today.worked_minutes)}</p>}

        {today.status === "pending" && <Button size="lg" disabled={busy} onClick={() => run(checkIn)}>{busy ? "Checking in..." : "Check in"}</Button>}
        {open && <Button size="lg" variant="secondary" disabled={busy} onClick={() => run(checkOut)}>{busy ? "Checking out..." : "Check out"}</Button>}
        {closed && <p className="text-sm font-medium text-success">Done for today. See you tomorrow.</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {note && <p role="status" className="text-sm text-success">{note}</p>}

        {(today.status === "pending" || open) && !today.is_wfh && (
          wfhOpen ? (
            <form className="flex flex-col gap-2" onSubmit={(e) => {
              e.preventDefault();
              run(async () => { const r = await requestWfh({ date, reason }); if (r.ok) { setNote("WFH requested. It counts as Present after your manager approves."); setWfhOpen(false); setReason(""); } return r; });
            }}>
              <label htmlFor="wfh-reason" className="text-sm font-medium">Reason for working from home</label>
              <input id="wfh-reason" className="h-11 rounded-lg border border-input bg-surface px-3 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
              <div className="flex gap-2"><Button type="submit" size="sm" disabled={busy || reason.trim().length < 5}>Send request</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setWfhOpen(false)}>Cancel</Button></div>
            </form>
          ) : (
            <button type="button" onClick={() => setWfhOpen(true)} className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-primary">
              <Home className="size-4" aria-hidden /> Request WFH today
            </button>
          )
        )}
      </CardBody>
    </Card>
  );
}
