"use client";

import { CheckCircle2, Paperclip } from "lucide-react";
import { useState } from "react";
import { blockingErrors, WorkingDaysCalculator } from "@/components/working-days-calculator";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, inputCls, textareaCls } from "@/components/ui/field";
import { type LeaveScenario } from "@/lib/preview-data";

const TYPES = [
  { code: "CL", label: "Casual Leave (CL) · 8.0 available" },
  { code: "SL", label: "Sick Leave (SL) · 7.0 available" },
  { code: "EL", label: "Earned Leave (EL) · 11.25 available" },
  { code: "LOP", label: "Loss of Pay (LOP)" },
];

// Preview only: the real form calls preview_leave() on every change and apply_leave() on submit.
export function ApplyForm({ scenarios, manager }: { scenarios: LeaveScenario[]; manager: string }) {
  const [key, setKey] = useState(scenarios[0].key);
  const sc = scenarios.find((s) => s.key === key)!;
  const [convert, setConvert] = useState(false);
  const [file, setFile] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const plan = sc.plan;
  const blocked = blockingErrors(plan, convert, file !== null).length > 0;
  const choose = (k: string) => { setKey(k); setConvert(false); setFile(null); setSent(false); };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3 text-sm">
        <label htmlFor="scenario" className="font-medium text-muted">Preview example:</label>
        <select id="scenario" value={key} onChange={(e) => choose(e.target.value)} className="h-10 rounded-lg border border-input bg-surface px-2">
          {scenarios.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <span className="text-muted">(sample data; the real screen recalculates as you type)</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardBody className="flex flex-col gap-4">
            <Field id="type" label="Leave type" required>
              <select id="type" className={inputCls} value={sc.typeCode} onChange={() => undefined}>
                {TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="from" label="From" required><input id="from" type="date" className={inputCls} value={sc.from} readOnly /></Field>
              <Field id="to" label="To" required><input id="to" type="date" className={inputCls} value={sc.to} readOnly /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" disabled className="size-4" /> Half day (available when From and To are the same date)
            </label>
            <Field id="reason" label="Reason" required hint="At least 5 characters">
              <textarea id="reason" className={textareaCls} value={sc.reason} readOnly maxLength={500} />
              <span className="text-right text-xs text-muted">{sc.reason.length}/500</span>
            </Field>
            <Field id="file" label="Attachment" hint={plan.requires_document ? "Required for this request. PDF, JPG or PNG under 5 MB." : "Optional. PDF, JPG or PNG under 5 MB."}>
              <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-surface px-3 text-sm font-medium">
                <Paperclip className="size-4" aria-hidden /> {file ?? "Upload a file"}
                <input id="file" type="file" accept=".pdf,.jpg,.jpeg,.png" className="sr-only" onChange={(e) => setFile(e.target.files?.[0]?.name ?? null)} />
              </label>
            </Field>
          </CardBody>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <WorkingDaysCalculator plan={plan} leaveCode={sc.typeCode} convert={convert} hasDoc={file !== null} />
          {plan.needs_conversion && (
            <label className="flex items-start gap-3 rounded-lg border border-warning bg-surface p-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-5" checked={convert} onChange={(e) => setConvert(e.target.checked)} />
              <span><span className="font-semibold">Convert {plan.excess} day{plan.excess === 1 ? "" : "s"} to Loss of Pay</span><br />
                <span className="text-muted">Your {sc.typeCode} balance covers {plan.paid_days}; the rest would be unpaid.</span></span>
            </label>
          )}
        </div>
      </div>

      <div className="sticky bottom-16 z-[5] mt-4 flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between lg:static lg:bottom-auto lg:shadow-none">
        {sent ? (
          <p className="flex items-center gap-2 text-sm font-medium text-success"><CheckCircle2 className="size-5" aria-hidden /> Sample only: the real screen would submit this and email {manager}.</p>
        ) : (
          <p className="text-sm text-muted">Your manager, {manager}, will be emailed.</p>
        )}
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1 sm:flex-none">Cancel</Button>
          <Button className="flex-1 sm:flex-none" disabled={blocked} onClick={() => setSent(true)}>Submit</Button>
        </div>
      </div>
    </>
  );
}
