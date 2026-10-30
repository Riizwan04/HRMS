"use client";

import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MonthCalendar } from "@/components/month-calendar";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { DayRow, MonthSummary } from "@/lib/attendance-types";
import { formatMonth } from "@/lib/time/ist";
import { cancelRequest } from "@/modules/attendance/actions";
import { DayPanel } from "./day-panel";

const KIND_KEY: Record<string, "wfh" | "regularisation" | "optional_holiday"> = { WFH: "wfh", Regularisation: "regularisation", "Optional holiday": "optional_holiday" };

export function AttendanceView({ rows, summary, requests, today, windowDays, live = false, prevHref, nextHref }: {
  rows: DayRow[]; summary: MonthSummary; requests: { id: string; kind: string; text: string; status: string }[]; today: string; windowDays: number;
  live?: boolean; prevHref?: string; nextHref?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [reqError, setReqError] = useState<string | null>(null);
  const cancel = (r: { id: string; kind: string }) => {
    setReqError(null);
    startTransition(async () => {
      const res = await cancelRequest({ kind: KIND_KEY[r.kind], id: r.id });
      if (!res.ok) setReqError(res.error); else router.refresh();
    });
  };
  const [selected, setSelected] = useState<string | null>(null);
  const row = rows.find((r) => r.day === selected) ?? null;
  const stat = (label: string, value: number) => (
    <div className="rounded-lg border border-border bg-surface px-3 py-2"><p className="text-xs text-muted">{label}</p><p className="text-xl font-semibold">{value}</p></div>
  );

  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {stat("Present", summary.present)}{stat("WFH", summary.wfh)}{stat("Half day", summary.half)}
        {stat("Absent", summary.absent)}{stat("On leave", summary.leave)}
        <div className="rounded-lg border border-border bg-surface px-3 py-2">
          <p className="flex items-center gap-1 text-xs text-muted"><Clock className="size-3" aria-hidden /> Late marks</p>
          <p className="text-xl font-semibold">{summary.lateMarks} of {summary.lateLimit}</p>
        </div>
      </div>
      <p className="mb-4 text-sm text-muted">
        {summary.lateMarks} of {summary.lateLimit} Late marks this month: {summary.lateLimit - summary.lateMarks === 1 ? "the next Late costs half a day of Loss of Pay." : "every third Late costs half a day of Loss of Pay."}
      </p>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="min-w-0">
          <CardHeader title={formatMonth(rows[0].day)} action={
            <div className="flex gap-1">
              {prevHref ? <Link href={prevHref} aria-label="Previous month" className="inline-flex h-9 items-center rounded-lg border border-input px-2"><ChevronLeft className="size-4" aria-hidden /></Link>
                : <Button size="sm" variant="secondary" disabled aria-label="Previous month"><ChevronLeft className="size-4" aria-hidden /></Button>}
              {nextHref ? <Link href={nextHref} aria-label="Next month" className="inline-flex h-9 items-center rounded-lg border border-input px-2"><ChevronRight className="size-4" aria-hidden /></Link>
                : <Button size="sm" variant="secondary" disabled aria-label="Next month"><ChevronRight className="size-4" aria-hidden /></Button>}
            </div>} />
          <CardBody>
            <MonthCalendar rows={rows} today={today} selected={selected} onSelect={setSelected} />
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Legend">
              {(["present", "half_day", "absent", "on_leave", "holiday", "weekly_off", "late"] as const).map((s) => <li key={s}><StatusBadge status={s} /></li>)}
            </ul>
          </CardBody>
        </Card>

        <Card className="min-w-0 self-start">
          <CardHeader title="My requests" />
          <CardBody className="flex flex-col divide-y divide-border p-0">
            {reqError && <p role="alert" className="px-4 py-3 text-sm text-danger">{reqError}</p>}
            {requests.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">No requests yet.</p>}
            {requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0 text-sm">
                  <p className="font-medium">{r.kind} <span className="ml-1 rounded-full border border-dashed border-input px-2 py-0.5 text-xs">{r.status}</span></p>
                  <p className="truncate text-muted">{r.text}</p>
                </div>
                {(!live || r.status === "pending") && <Button size="sm" variant="ghost" onClick={() => live && cancel(r)}>Cancel</Button>}
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      {row && <DayPanel key={row.day} row={row} today={today} windowDays={windowDays} onClose={() => setSelected(null)} live={live} />}
    </>
  );
}
