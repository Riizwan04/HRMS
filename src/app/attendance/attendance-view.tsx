"use client";

import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { useState } from "react";
import { MonthCalendar } from "@/components/month-calendar";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { DayRow, MonthSummary } from "@/lib/attendance-types";
import { formatMonth } from "@/lib/time/ist";
import { DayPanel } from "./day-panel";

export function AttendanceView({ rows, summary, requests, today, windowDays }: {
  rows: DayRow[]; summary: MonthSummary; requests: { id: string; kind: string; text: string; status: string }[]; today: string; windowDays: number;
}) {
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
              <Button size="sm" variant="secondary" disabled aria-label="Previous month"><ChevronLeft className="size-4" aria-hidden /></Button>
              <Button size="sm" variant="secondary" disabled aria-label="Next month"><ChevronRight className="size-4" aria-hidden /></Button>
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
            {requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0 text-sm">
                  <p className="font-medium">{r.kind} <span className="ml-1 rounded-full border border-dashed border-input px-2 py-0.5 text-xs">{r.status}</span></p>
                  <p className="truncate text-muted">{r.text}</p>
                </div>
                <Button size="sm" variant="ghost">Cancel</Button>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      {row && <DayPanel key={row.day} row={row} today={today} windowDays={windowDays} onClose={() => setSelected(null)} />}
    </>
  );
}
