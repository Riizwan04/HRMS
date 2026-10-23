import { AlertTriangle, Check, Minus } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { type LeavePlan, type PlanError, planErrorMessage } from "@/lib/leave-plan";
import { formatDayShort } from "@/lib/time/ist";

const REASON: Record<string, string> = { weekly_off: "Weekly Off", holiday: "Holiday", optional_holiday: "Your optional holiday" };
const fmt = (x: number | null) => (x === null ? "-" : Number.isInteger(x) ? x.toFixed(1) : String(x));

/** Errors still blocking submit after the user's choices (convert-to-LOP ticked, document attached). */
export function blockingErrors(plan: LeavePlan, convert: boolean, hasDoc: boolean): PlanError[] {
  return plan.errors.filter((e) => !(e.code === "insufficient_balance" && convert) && !(e.code === "document_required" && hasDoc));
}

/** Renders a preview_leave() result. It never computes working days itself: the database does (CLAUDE.md rule 5). */
export function WorkingDaysCalculator({ plan, leaveCode, convert, hasDoc }: { plan: LeavePlan | null; leaveCode: string; convert: boolean; hasDoc: boolean }) {
  if (!plan) {
    return (
      <Card>
        <CardHeader title="Working days" />
        <CardBody className="text-sm text-muted">Choose dates to see the working days and your balance.</CardBody>
      </Card>
    );
  }
  const errors = blockingErrors(plan, convert, hasDoc);
  const paid = convert ? plan.paid_days : plan.days;
  const lop = convert ? plan.lop_days : 0;
  return (
    <Card aria-live="polite">
      <CardHeader title="Working days" />
      <CardBody className="flex flex-col gap-4">
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {plan.breakdown.map((d) => (
            <li key={d.date} className="flex items-center gap-2 text-sm">
              {d.counts ? <Check className="size-4 text-success" aria-hidden /> : <Minus className="size-4 text-muted" aria-hidden />}
              <span className={d.counts ? "font-medium" : "text-muted"}>{formatDayShort(d.date)}</span>
              <span className="text-muted">
                {d.counts ? "counts" : `${REASON[d.reason ?? ""] ?? "Off"}${d.name ? `: ${d.name}` : ""} (not counted)`}
              </span>
            </li>
          ))}
        </ul>
        <div className="rounded-lg bg-bg p-3 text-sm">
          <p className="text-base font-semibold">Total: {fmt(plan.days)} working day{plan.days === 1 ? "" : "s"}</p>
          {plan.available !== null && (
            <p className="mt-1 text-muted">
              {leaveCode} balance {fmt(plan.available)}
              {plan.balance_after !== null && <> → <span className="font-medium text-text">after approval {fmt(convert ? Math.max(plan.available - paid, 0) : plan.balance_after)}</span></>}
              {plan.pending ? ` (${fmt(plan.pending)} already pending)` : ""}
            </p>
          )}
          {convert && lop > 0 && <p className="mt-1 font-medium text-warning">{fmt(paid)} paid + {fmt(lop)} Loss of Pay</p>}
        </div>
        {errors.length > 0 && (
          <ul role="alert" className="flex flex-col gap-1.5">
            {errors.map((e, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-danger">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {planErrorMessage(e, leaveCode)}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
