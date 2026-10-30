"use client";

import { CheckCircle2, Paperclip } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { blockingErrors, WorkingDaysCalculator } from "@/components/working-days-calculator";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, inputCls, textareaCls } from "@/components/ui/field";
import { type LeavePlan, planErrorMessage } from "@/lib/leave-plan";
import { applyLeave, previewLeave, uploadCertificate } from "@/modules/leave/actions";

// Client components import the server actions file directly (the module's index also pulls in server-only reads).
type Option = { id: string; code: string; name: string; halfDayAllowed: boolean; available: number | null };
const fmt = (x: number) => (Number.isInteger(x) ? x.toFixed(1) : String(x));

export function ApplyFormLive({ types, manager, today, uploadsReady = true }: { types: Option[]; manager: string | null; today: string; uploadsReady?: boolean }) {
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [half, setHalf] = useState(false);
  const [session, setSession] = useState<"first" | "second">("first");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [convert, setConvert] = useState(false);
  const [plan, setPlan] = useState<LeavePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [busy, startSubmit] = useTransition();
  const type = types.find((t) => t.id === typeId);
  const single = from !== "" && from === to;
  const valid = Boolean(typeId && from && to && to >= from);

  // The database calculates; this only asks it again whenever an input changes (preview_leave).
  useEffect(() => {
    if (!valid) return;
    let live = true;
    const t = setTimeout(async () => {
      try {
        const p = await previewLeave({ typeId, from, to, half: half && single, session: half && single ? session : null, convert, hasDoc: file !== null });
        if (live) setPlan(p);
      } catch { if (live) setPlan(null); }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [valid, typeId, from, to, half, single, session, convert, file]);

  const shownPlan = valid ? plan : null;
  const blocked = !shownPlan || blockingErrors(shownPlan, convert, file !== null).length > 0 || reason.trim().length < 5 || busy;

  function submit() {
    setError(null);
    startSubmit(async () => {
      let attachment: string | null = null;
      if (file) {
        const fd = new FormData(); fd.set("file", file);
        const up = await uploadCertificate(fd);
        if (!up.ok) { setError(up.error); return; }
        attachment = up.path;
      }
      const r = await applyLeave({ typeId, from, to, half: half && single, session: half && single ? session : null, reason, attachment, convert });
      if (r.ok && r.id) setDoneId(r.id);
      else setError(r.errors?.length ? r.errors.map((e) => planErrorMessage(e, type?.code)).join(". ") : "Could not submit the request");
    });
  }

  if (doneId) {
    return (
      <Card><CardBody className="flex flex-col items-start gap-3">
        <p className="flex items-center gap-2 font-medium text-success"><CheckCircle2 className="size-5" aria-hidden /> Request submitted{manager ? `. ${manager} will see it in their Approvals.` : ". HR will see it in Approvals."}</p>
        <Link href="/leave" className="font-medium text-primary underline">View my leave</Link>
      </CardBody></Card>
    );
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="min-w-0"><CardBody className="flex flex-col gap-4">
          <Field id="type" label="Leave type" required>
            <select id="type" className={inputCls} value={typeId} onChange={(e) => { setTypeId(e.target.value); setConvert(false); setHalf(false); }}>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.code}){t.available !== null ? ` · ${fmt(t.available)} available` : ""}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="from" label="From" required><input id="from" type="date" className={inputCls} value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} /></Field>
            <Field id="to" label="To" required><input id="to" type="date" className={inputCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" className="size-4" checked={half} disabled={!single || !type?.halfDayAllowed} onChange={(e) => setHalf(e.target.checked)} />
            Half day (available when From and To are the same date{type && !type.halfDayAllowed ? "; not allowed for this type" : ""})
          </label>
          {half && single && (
            <div className="flex gap-4 text-sm">
              {(["first", "second"] as const).map((s) => (
                <label key={s} className="flex items-center gap-2"><input type="radio" name="session" checked={session === s} onChange={() => setSession(s)} /> {s === "first" ? "First half" : "Second half"}</label>
              ))}
            </div>
          )}
          <Field id="reason" label="Reason" required hint="At least 5 characters">
            <textarea id="reason" className={textareaCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            <span className="text-right text-xs text-muted">{reason.length}/500</span>
          </Field>
          <Field id="file" label="Attachment" hint={plan?.requires_document ? (uploadsReady ? "Required for this request. PDF, JPG or PNG under 5 MB." : "A medical certificate is required for this request, but file uploads are switched off in this deployment. Please contact HR.") : "Optional. PDF, JPG or PNG under 5 MB."}>
            <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-surface px-3 text-sm font-medium">
              <Paperclip className="size-4" aria-hidden /> {file?.name ?? "Upload a file"}
              <input id="file" type="file" accept=".pdf,.jpg,.jpeg,.png" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </Field>
        </CardBody></Card>

        <div className="flex min-w-0 flex-col gap-4">
          <WorkingDaysCalculator plan={shownPlan} leaveCode={type?.code ?? ""} convert={convert} hasDoc={file !== null} />
          {plan?.needs_conversion && (
            <label className="flex items-start gap-3 rounded-lg border border-warning bg-surface p-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-5" checked={convert} onChange={(e) => setConvert(e.target.checked)} />
              <span><span className="font-semibold">Convert {plan.excess} day{plan.excess === 1 ? "" : "s"} to Loss of Pay</span><br />
                <span className="text-muted">Your {type?.code} balance covers {plan.paid_days}; the rest would be unpaid.</span></span>
            </label>
          )}
        </div>
      </div>

      <div className="sticky bottom-16 z-[5] mt-4 flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between lg:static lg:bottom-auto lg:shadow-none">
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : <p className="text-sm text-muted">{manager ? `Your manager, ${manager}, will be asked to approve.` : "HR will be asked to approve."}</p>}
        <div className="flex gap-2">
          <Link href="/leave" className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-input px-4 text-sm font-semibold sm:flex-none">Cancel</Link>
          <Button className="flex-1 sm:flex-none" disabled={blocked} onClick={submit}>{busy ? "Submitting..." : "Submit"}</Button>
        </div>
      </div>
    </>
  );
}
