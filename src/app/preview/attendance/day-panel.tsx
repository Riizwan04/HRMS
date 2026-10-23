"use client";

import { CheckCircle2, X } from "lucide-react";
import { useState } from "react";
import { StatusBadge, type DayStatus } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, inputCls, textareaCls } from "@/components/ui/field";
import type { DayRow } from "@/lib/attendance-types";
import { diffDays, formatDayShort, formatTimeIST } from "@/lib/time/ist";

const BADGE: Partial<Record<DayRow["status"], DayStatus>> = {
  present: "present", half_day: "half_day", absent: "absent", on_leave: "on_leave", holiday: "holiday", weekly_off: "weekly_off",
};
const hm = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} m`;
type Mode = "view" | "regularise" | "wfh";

// Preview only: the real panel calls request_regularisation() / request_wfh(); the database enforces every rule.
export function DayPanel({ row, today, windowDays, onClose }: { row: DayRow; today: string; windowDays: number; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("view");
  const [inT, setInT] = useState("09:55");
  const [outT, setOutT] = useState("18:00");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const age = diffDays(row.day, today);
  const canRegularise = age >= 0 && age <= windowDays && (row.status === "absent" || row.status === "half_day" || row.missing_checkout);
  const canWfh = age <= 0 && (row.status === "future" || row.status === "pending" || row.status === "in_progress");

  const reasonErr = touched && reason.trim().length < 5 ? "Please give a reason (at least 5 characters)" : null;
  const outErr = mode === "regularise" && touched && outT && inT && outT <= inT ? "Check-out must be after check-in" : null;
  const submit = () => {
    setTouched(true);
    if (reason.trim().length < 5 || (mode === "regularise" && outT <= inT)) return;
    setDone(mode === "regularise" ? "Correction requested. Your manager will review it; attendance changes only after approval." : "WFH requested. It counts as Present only after your manager approves.");
    setMode("view");
  };

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-black/30 lg:items-stretch lg:justify-end" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Details for ${formatDayShort(row.day)}`} onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl lg:max-h-none lg:w-96 lg:rounded-none">
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold">{formatDayShort(row.day)} {row.day.slice(0, 4)}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 hover:bg-bg"><X className="size-5" aria-hidden /></button>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {BADGE[row.status] ? <StatusBadge status={BADGE[row.status]!} wfh={row.is_wfh} pending={!!row.pending_request} /> : (
            <span className="rounded-full bg-bg px-2.5 py-1 text-xs font-semibold text-muted">
              {row.status === "in_progress" ? "Today, checked in" : row.status === "pending" ? "Today, not checked in" : "Upcoming"}
            </span>
          )}
          {row.is_late && <StatusBadge status="late" />}
        </div>

        <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {row.leave_type_code && (<><dt className="text-muted">Leave</dt><dd>{row.leave_type_code}</dd></>)}
          {row.off_name && (<><dt className="text-muted">Holiday</dt><dd>{row.off_name}</dd></>)}
          {row.pending_request && (<><dt className="text-muted">Request</dt><dd>{row.pending_request}</dd></>)}
          <dt className="text-muted">Check-in</dt><dd>{row.check_in ? `${formatTimeIST(row.check_in)} IST` : "-"}</dd>
          <dt className="text-muted">Check-out</dt><dd>{row.check_out ? `${formatTimeIST(row.check_out)} IST` : row.missing_checkout ? "Missing" : "-"}</dd>
          {row.worked_minutes !== null && (<><dt className="text-muted">Worked</dt><dd>{hm(row.worked_minutes)}</dd></>)}
        </dl>

        {done && <p className="mb-3 flex items-start gap-2 rounded-lg bg-st-present-bg p-3 text-sm text-st-present"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> {done} <span className="opacity-70">(sample)</span></p>}

        {mode === "view" && (
          <div className="flex flex-col gap-2">
            {canRegularise && <Button onClick={() => { setMode("regularise"); setDone(null); setTouched(false); }}>Request regularisation</Button>}
            {canWfh && <Button variant="secondary" onClick={() => { setMode("wfh"); setDone(null); setTouched(false); }}>Request WFH</Button>}
            {!canRegularise && !canWfh && <p className="text-sm text-muted">Nothing to request for this day.</p>}
            {row.status === "absent" && <p className="text-xs text-muted">You can ask for corrections up to {windowDays} days back. Attendance changes only after your manager approves.</p>}
          </div>
        )}

        {mode !== "view" && (
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
            <h3 className="font-semibold">{mode === "regularise" ? "Request regularisation" : "Request work from home"}</h3>
            <Field id="date" label="Date"><input id="date" className={inputCls} value={`${formatDayShort(row.day)} ${row.day.slice(0, 4)}`} readOnly /></Field>
            {mode === "regularise" && (
              <div className="grid grid-cols-2 gap-3">
                <Field id="in" label="Check-in (IST)" required><input id="in" type="time" className={inputCls} value={inT} onChange={(e) => setInT(e.target.value)} /></Field>
                <Field id="out" label="Check-out (IST)" required error={outErr}><input id="out" type="time" className={inputCls} value={outT} onChange={(e) => setOutT(e.target.value)} aria-invalid={!!outErr} /></Field>
              </div>
            )}
            <Field id="reason" label="Reason" required hint="At least 5 characters" error={reasonErr}>
              <textarea id="reason" className={textareaCls} value={reason} onChange={(e) => setReason(e.target.value)} onBlur={() => setTouched(true)} aria-invalid={!!reasonErr} maxLength={500} />
            </Field>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setMode("view")}>Cancel</Button>
              <Button type="submit" className="flex-1">Submit request</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
