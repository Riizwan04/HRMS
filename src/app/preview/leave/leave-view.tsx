"use client";

import { FileCheck2, Plane } from "lucide-react";
import { useState } from "react";
import { RequestStatusBadge } from "@/components/request-status-badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatRange } from "@/lib/time/ist";
import type { LeaveHistoryRow } from "@/lib/preview-data";

type Balance = { code: string; name: string; opening: number; accrued: number; adjusted: number; used: number; pending: number; available: number };
const f = (x: number) => (Number.isInteger(x) ? x.toFixed(1) : String(x));

export function LeaveView({ balances, lopTaken, history, today, role }: {
  balances: Balance[]; lopTaken: number; history: LeaveHistoryRow[]; today: string; role: string;
}) {
  const [rows, setRows] = useState(history);
  const [status, setStatus] = useState("all");
  const [confirm, setConfirm] = useState<LeaveHistoryRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const shown = rows.filter((r) => status === "all" || r.status === status);
  // Same rule the database enforces in cancel_leave(): pending, or approved and not started yet.
  const canCancel = (r: LeaveHistoryRow) => r.status === "pending" || (r.status === "approved" && r.from > today);

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {balances.map((b) => (
          <Card key={b.code} className="p-4">
            <p className="text-sm text-muted">{b.name} <span className="font-semibold text-text">({b.code})</span></p>
            <p className="mt-1 text-3xl font-semibold">{f(b.available)}</p>
            <p className="text-sm text-muted">available</p>
            <p className="mt-2 text-xs leading-5 text-muted">
              Opening {f(b.opening)} · Accrued {f(b.accrued)} · Adjusted {f(b.adjusted)}<br />Used {f(b.used)} · <span className="font-medium text-text">Pending {f(b.pending)}</span>
            </p>
          </Card>
        ))}
        <Card className="p-4">
          <p className="text-sm text-muted">Loss of Pay <span className="font-semibold text-text">(LOP)</span></p>
          <p className="mt-1 text-3xl font-semibold">{f(lopTaken)}</p>
          <p className="text-sm text-muted">days taken this year</p>
        </Card>
      </div>
      <p className="mb-6 text-sm text-muted">
        Maternity and Paternity leave are event-based and don&apos;t use these balances. Paternity: up to 5 consecutive working days. Pending requests don&apos;t reduce what&apos;s available until approved.
      </p>

      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold">Request history</h2>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="yr">Year</label>
          <select id="yr" className="h-10 rounded-lg border border-input bg-surface px-2 text-sm" defaultValue="2026"><option>2026</option><option>2025</option></select>
          <label className="sr-only" htmlFor="st">Status</label>
          <select id="st" className="h-10 rounded-lg border border-input bg-surface px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option>
            <option value="rejected">Rejected</option><option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {notice && <p role="status" className="mb-3 rounded-lg bg-st-present-bg p-3 text-sm text-st-present">{notice}</p>}

      {shown.length === 0 ? (
        <Card><CardBody className="flex flex-col items-center gap-3 py-10 text-center">
          <Plane className="size-8 text-muted" aria-hidden />
          <p className="font-medium">{rows.length === 0 ? "You haven't applied for leave this year." : "No requests match this filter."}</p>
          <LinkButton href={`/preview/leave/apply?role=${role}`}>Apply for leave</LinkButton>
        </CardBody></Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-bg text-xs uppercase tracking-wide text-muted">
                <tr><th className="px-4 py-3">Type</th><th className="px-4 py-3">Dates</th><th className="px-4 py-3">Days</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Decision</th><th className="px-4 py-3"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-medium">{r.type}</td>
                    <td className="px-4 py-3">{formatRange(r.from, r.to)}</td>
                    <td className="px-4 py-3">{f(r.days)}{r.lopDays > 0 && r.type !== "LOP" ? ` (${f(r.lopDays)} LOP)` : ""}</td>
                    <td className="px-4 py-3"><RequestStatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 text-muted">
                      {r.decidedBy ? `${r.decidedBy}${r.comment ? `: “${r.comment}”` : ""}` : "-"}
                      {r.attachment && <span className="ml-2 inline-flex items-center gap-1 text-primary"><FileCheck2 className="size-4" aria-hidden /> certificate</span>}
                    </td>
                    <td className="px-4 py-3 text-right">{canCancel(r) && <Button size="sm" variant="ghost" onClick={() => setConfirm(r)}>Cancel</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <ul className="flex flex-col gap-3 md:hidden">
            {shown.map((r) => (
              <li key={r.id}><Card className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{r.type} <span className="font-normal text-muted">· {f(r.days)} day{r.days === 1 ? "" : "s"}</span></p>
                  <RequestStatusBadge status={r.status} />
                </div>
                <p className="mt-1 text-sm">{formatRange(r.from, r.to)}</p>
                {r.decidedBy && <p className="mt-1 text-sm text-muted">{r.decidedBy}{r.comment ? `: “${r.comment}”` : ""}</p>}
                {canCancel(r) && <Button size="sm" variant="secondary" className="mt-3" onClick={() => setConfirm(r)}>Cancel request</Button>}
              </Card></li>
            ))}
          </ul>
        </>
      )}

      {confirm && (
        <ConfirmDialog title={`Cancel ${confirm.type} ${formatRange(confirm.from, confirm.to)}?`} confirmLabel="Cancel leave"
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            setRows((rs) => rs.map((r) => (r.id === confirm.id ? { ...r, status: "cancelled" } : r)));
            setNotice("Leave cancelled and your balance restored. (Sample: the real screen calls cancel_leave().)");
            setConfirm(null);
          }}>
          Your balance will be restored.
        </ConfirmDialog>
      )}
    </>
  );
}
