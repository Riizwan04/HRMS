import clsx from "clsx";
import { CheckCircle2, Clock, Contrast, Home, Moon, PartyPopper, Plane, XCircle } from "lucide-react";
import type { ComponentType } from "react";

/** The single source of status colours (DESIGN.md 2.3). Badge = icon + label; never colour alone. */
export type DayStatus = "present" | "half_day" | "absent" | "on_leave" | "holiday" | "weekly_off" | "late";

const CONFIG: Record<DayStatus, { label: string; code: string; cls: string; Icon: ComponentType<{ className?: string }> }> = {
  present: { label: "Present", code: "P", cls: "bg-st-present-bg text-st-present", Icon: CheckCircle2 },
  half_day: { label: "Half Day", code: "½", cls: "bg-st-half-bg text-st-half", Icon: Contrast },
  absent: { label: "Absent", code: "A", cls: "bg-st-absent-bg text-st-absent", Icon: XCircle },
  on_leave: { label: "On Leave", code: "L", cls: "bg-st-leave-bg text-st-leave", Icon: Plane },
  holiday: { label: "Holiday", code: "H", cls: "bg-st-holiday-bg text-st-holiday", Icon: PartyPopper },
  weekly_off: { label: "Weekly Off", code: "WO", cls: "bg-st-off-bg text-st-off", Icon: Moon },
  late: { label: "Late", code: "L!", cls: "bg-st-late-bg text-st-late", Icon: Clock },
};

export const statusLabel = (s: DayStatus) => CONFIG[s].label;
export const statusCode = (s: DayStatus) => CONFIG[s].code;

export function StatusBadge({ status, wfh, pending, className }: { status: DayStatus; wfh?: boolean; pending?: boolean; className?: string }) {
  const { label, cls, Icon } = CONFIG[status];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        cls, pending && "border border-dashed border-current", className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
      {wfh && (<><Home className="size-3.5" aria-hidden /><span>WFH</span></>)}
    </span>
  );
}

import type { DayStatusKey } from "@/lib/attendance-types";

/** Calendar cell look for every day-status value (same colours as the badges). */
export function cellStyle(status: DayStatusKey): { cls: string; code: string; label: string } {
  switch (status) {
    case "present": return { cls: "bg-st-present-bg text-st-present", code: "P", label: "Present" };
    case "half_day": return { cls: "bg-st-half-bg text-st-half", code: "½", label: "Half Day" };
    case "absent": return { cls: "bg-st-absent-bg text-st-absent", code: "A", label: "Absent" };
    case "on_leave": return { cls: "bg-st-leave-bg text-st-leave", code: "L", label: "On Leave" };
    case "holiday": return { cls: "bg-st-holiday-bg text-st-holiday", code: "H", label: "Holiday" };
    case "weekly_off": return { cls: "bg-st-off-bg text-st-off", code: "WO", label: "Weekly Off" };
    case "in_progress": return { cls: "bg-surface text-text outline outline-2 -outline-offset-2 outline-primary", code: "•", label: "Today, in progress" };
    case "pending": return { cls: "bg-surface text-muted outline outline-2 -outline-offset-2 outline-primary", code: "", label: "Today, not checked in" };
    case "not_employed": return { cls: "bg-[repeating-linear-gradient(135deg,#2b3a55_0_4px,#182130_4px_8px)] text-muted", code: "", label: "Not employed" };
    default: return { cls: "bg-surface text-muted", code: "", label: "" };
  }
}
