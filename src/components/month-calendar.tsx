"use client";

import clsx from "clsx";
import { Clock, Home } from "lucide-react";
import { cellStyle } from "@/components/status-badge";
import type { DayRow } from "@/lib/attendance-types";
import { formatDayShort, isoWeekday } from "@/lib/time/ist";

const HEAD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Month grid. Every cell is a button with a full text label, so colour is never the only signal. */
export function MonthCalendar({ rows, today, selected, onSelect }: {
  rows: DayRow[]; today: string; selected: string | null; onSelect: (day: string) => void;
}) {
  const lead = isoWeekday(rows[0].day) - 1;
  return (
    <div role="grid" aria-label="Attendance calendar" className="grid grid-cols-7 gap-1.5">
      {HEAD.map((h) => <div key={h} role="columnheader" className="pb-1 text-center text-xs font-semibold text-muted">{h}</div>)}
      {Array.from({ length: lead }, (_, i) => <div key={`b${i}`} role="gridcell" aria-hidden />)}
      {rows.map((r) => {
        const st = cellStyle(r.status);
        const label = `${formatDayShort(r.day)}: ${st.label || "Upcoming"}${r.is_late ? ", late" : ""}${r.is_wfh ? ", work from home" : ""}${r.pending_request ? `, ${r.pending_request}` : ""}`;
        return (
          <button key={r.day} type="button" role="gridcell" aria-label={label} onClick={() => onSelect(r.day)}
            className={clsx("relative flex aspect-square min-h-12 flex-col items-center justify-center rounded-md text-sm font-semibold",
              st.cls, r.day === today && "ring-2 ring-primary", r.day === selected && "ring-4 ring-primary/60",
              r.pending_request && "border-2 border-dashed border-current")}>
            <span className="absolute left-1.5 top-1 text-[11px] font-medium opacity-80">{Number(r.day.slice(8))}</span>
            <span aria-hidden className={r.pending_request && !st.code ? "text-[11px] font-medium" : "text-base"}>{st.code || (r.pending_request ? r.pending_request.split(" ")[0] : "")}</span>
            <span className="absolute bottom-1 right-1 flex gap-0.5">
              {r.is_late && <Clock className="size-3 text-st-late" aria-hidden />}
              {r.is_wfh && <Home className="size-3" aria-hidden />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
