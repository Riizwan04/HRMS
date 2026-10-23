"use client";

import clsx from "clsx";
import { AlertTriangle, CalendarClock, FileCheck2, Home, Inbox, PartyPopper, Plane } from "lucide-react";
import { useState } from "react";
import { RequestStatusBadge } from "@/components/request-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, textareaCls } from "@/components/ui/field";
import { type ApprovalItem } from "@/lib/preview-data";
import { formatDayShort, formatRange, formatTimeIST } from "@/lib/time/ist";

const KIND = {
  leave: { label: "Leave", Icon: Plane },
  regularisation: { label: "Regularisation", Icon: CalendarClock },
  wfh: { label: "WFH", Icon: Home },
  optional_holiday: { label: "Optional holiday", Icon: PartyPopper },
} as const;
const f = (x: number) => x.toFixed(1);

function Details({ it }: { it: ApprovalItem }) {
  if (it.kind === "leave") {
    return (
      <div className="flex flex-col gap-1.5 text-sm">
        <p className="font-medium">{it.type} · {formatRange(it.from, it.to)} · {it.days} working day{it.days === 1 ? "" : "s"}</p>
        <p className="text-muted">{it.type} balance {f(it.available)} → {f(it.after)} after approval</p>
        {it.clashes.length > 0 && (
          <p className="flex items-center gap-1.5 text-warning"><AlertTriangle className="size-4" aria-hidden /> {it.clashes.join(", ")} {it.clashes.length === 1 ? "is" : "are"} also on leave in this period</p>
        )}
        {it.attachment && <p className="flex items-center gap-1.5 text-primary"><FileCheck2 className="size-4" aria-hidden /> Medical certificate attached</p>}
      </div>
    );
  }
  if (it.kind === "regularisation") {
    return <p className="text-sm font-medium">{formatDayShort(it.workDate)} · check-in {formatTimeIST(it.inIso)}, check-out {formatTimeIST(it.outIso)} <span className="font-normal text-muted">(IST)</span></p>;
  }
  if (it.kind === "wfh") {
    return <div className="text-sm"><p className="font-medium">{formatDayShort(it.workDate)}</p><p className="text-muted">Counts as a full Present day once approved.</p></div>;
  }
  return <div className="text-sm"><p className="font-medium">{it.holiday} · {formatDayShort(it.date)}</p><p className="text-muted">Becomes a paid holiday for them; {it.leftAfter} of 2 optional holidays left afterwards.</p></div>;
}

function RequestCard({ it, onDecide }: { it: ApprovalItem; onDecide: (id: string, outcome: "approved" | "rejected", comment: string) => void }) {
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [commentErr, setCommentErr] = useState<string | null>(null);
  const { label, Icon } = KIND[it.kind];
  const reason = "reason" in it ? it.reason : null;

  const reject = () => {
    if (comment.trim() === "") { setCommentErr("Add a short comment so the employee knows why"); return; }
    onDecide(it.id, "rejected", comment.trim());
  };
  const approve = () => {
    setCommentErr(null);
    if (it.kind === "leave" && it.failsOnApprove) { setErr(it.failsOnApprove); return; }
    onDecide(it.id, "approved", comment.trim());
  };

  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">{it.name} <span className="font-normal text-muted">· {it.code}</span></p>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-semibold"><Icon className="size-3.5" aria-hidden /> {label}</span>
        </div>
        <Details it={it} />
        {reason && (
          <blockquote className="rounded-lg bg-bg p-3 text-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Employee&apos;s words</p>
            “{reason}”
          </blockquote>
        )}
        {err && <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger p-3 text-sm text-danger"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {err}</p>}
        <Field id={`c-${it.id}`} label="Comment" hint="Optional when approving; required when rejecting." error={commentErr}>
          <textarea id={`c-${it.id}`} className={clsx(textareaCls, "min-h-16")} value={comment} onChange={(e) => setComment(e.target.value)} aria-invalid={!!commentErr} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={reject}>Reject</Button>
          <Button onClick={approve}>Approve</Button>
        </div>
      </CardBody>
    </Card>
  );
}

export function ApprovalsView({ items, decided }: { items: ApprovalItem[]; decided: { id: string; text: string; outcome: string; comment: string }[] }) {
  const [pending, setPending] = useState(items);
  const [done, setDone] = useState(decided);
  const [tab, setTab] = useState<"all" | ApprovalItem["kind"] | "decided">("all");
  const [notice, setNotice] = useState<string | null>(null);

  const decide = (id: string, outcome: "approved" | "rejected", comment: string) => {
    const it = pending.find((p) => p.id === id)!;
    setPending((ps) => ps.filter((p) => p.id !== id));
    setDone((d) => [{ id, text: `${it.code} ${it.name} · ${KIND[it.kind].label}`, outcome, comment: comment || (outcome === "approved" ? "Approved" : "") }, ...d]);
    setNotice(`${outcome === "approved" ? "Approved" : "Rejected"}. The employee is notified. (Sample: the real screen calls the decide function.)`);
  };

  const count = (k: ApprovalItem["kind"]) => pending.filter((p) => p.kind === k).length;
  const tabs: { key: typeof tab; label: string; n?: number }[] = [
    { key: "all", label: "All", n: pending.length }, { key: "leave", label: "Leave", n: count("leave") },
    { key: "regularisation", label: "Regularisation", n: count("regularisation") }, { key: "wfh", label: "WFH", n: count("wfh") },
    { key: "optional_holiday", label: "Optional holiday", n: count("optional_holiday") }, { key: "decided", label: "Decided" },
  ];
  const shown = pending.filter((p) => tab === "all" || p.kind === tab);

  return (
    <>
      <div role="tablist" aria-label="Request types" className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={clsx("flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium",
              tab === t.key ? "border-primary text-primary" : "border-transparent text-muted hover:text-text")}>
            {t.label}{t.n !== undefined && <span className="rounded-full bg-bg px-2 text-xs">{t.n}</span>}
          </button>
        ))}
      </div>
      {notice && <p role="status" className="mb-3 rounded-lg bg-st-present-bg p-3 text-sm text-st-present">{notice}</p>}

      {tab === "decided" ? (
        <Card><CardBody className="flex flex-col divide-y divide-border p-0">
          {done.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div><p className="font-medium">{d.text}</p>{d.comment && <p className="text-muted">“{d.comment}”</p>}</div>
              <RequestStatusBadge status={d.outcome === "approved" ? "approved" : "rejected"} />
            </div>
          ))}
        </CardBody></Card>
      ) : shown.length === 0 ? (
        <Card><CardBody className="flex flex-col items-center gap-2 py-12 text-center">
          <Inbox className="size-8 text-muted" aria-hidden />
          <p className="font-medium">You&apos;re all caught up</p>
          <p className="text-sm text-muted">No pending requests.</p>
        </CardBody></Card>
      ) : (
        <ul className="grid gap-4 xl:grid-cols-2">{shown.map((it) => <li key={it.id}><RequestCard it={it} onDecide={decide} /></li>)}</ul>
      )}
    </>
  );
}
