import type { DayRow, DayStatusKey, MonthSummary } from "./attendance-types";
import type { LeavePlan } from "./leave-plan";
import { isoWeekday } from "./time/ist";

// SAMPLE DATA for the /preview pages only. Removed when the screens are wired to the database.
export type Role = "employee" | "manager" | "hr";

export const sample = {
  user: { name: "Asha Naik", code: "KCF0007", location: "Panaji Head Office" },
  nowIso: "2026-10-16T04:28:00Z", // Fri 16 Oct 2026, 9:58 am IST
  checkInIso: "2026-10-16T04:28:00Z",
  balances: [
    { code: "CL", name: "Casual Leave", available: 8.0, pending: 2.0 },
    { code: "SL", name: "Sick Leave", available: 7.0, pending: 0 },
    { code: "EL", name: "Earned Leave", available: 11.25, pending: 0 },
  ],
  pending: [
    { id: "1", kind: "Leave", text: "CL · 22–23 Oct · 2 days" },
    { id: "2", kind: "WFH", text: "Mon 19 Oct" },
  ],
  team: { present: 6, wfh: 1, leave: 1, notIn: 1, decisions: 3 },
  org: { active: 178, onLeave: 7, absent: 4, invites: 2, missingOut: 3 },
};


const day = (date: string, weekday: string, counts = true, reason: LeavePlan["breakdown"][number]["reason"] = null, name: string | null = null) =>
  ({ date, weekday, counts, reason, name });

export type LeaveScenario = {
  key: string; label: string; typeCode: "CL" | "SL"; from: string; to: string; reason: string; plan: LeavePlan;
};

// Canned plans shaped exactly like preview_leave() output (sample numbers).
export const leaveScenarios: LeaveScenario[] = [
  {
    key: "normal", label: "Friday to Monday at head office", typeCode: "CL", from: "2026-10-23", to: "2026-10-26", reason: "Family function",
    plan: { errors: [], days: 2, paid_days: 2, lop_days: 0, available: 8, pending: 0, balance_after: 6, needs_conversion: false, excess: 0, requires_document: false,
      breakdown: [day("2026-10-23", "Fri"), day("2026-10-24", "Sat", false, "weekly_off"), day("2026-10-25", "Sun", false, "weekly_off"), day("2026-10-26", "Mon")] },
  },
  {
    key: "balance", label: "More CL than available", typeCode: "CL", from: "2026-11-02", to: "2026-11-13", reason: "Long trip home",
    plan: { errors: [{ code: "insufficient_balance", available: 6, requested: 10, excess: 4 }], days: 10, paid_days: 6, lop_days: 4, available: 8, pending: 2, balance_after: 2,
      needs_conversion: true, excess: 4, requires_document: false,
      breakdown: ["02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13"].map((d, i) => {
        const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"][i];
        return wd === "Sat" || wd === "Sun" ? day(`2026-11-${d}`, wd, false, "weekly_off") : day(`2026-11-${d}`, wd);
      }) },
  },
  {
    key: "sick", label: "Sick leave for 3 days", typeCode: "SL", from: "2026-11-16", to: "2026-11-18", reason: "Viral fever, doctor advised rest",
    plan: { errors: [{ code: "document_required" }], days: 3, paid_days: 3, lop_days: 0, available: 7, pending: 0, balance_after: 4, needs_conversion: false, excess: 0, requires_document: true,
      breakdown: [day("2026-11-16", "Mon"), day("2026-11-17", "Tue"), day("2026-11-18", "Wed")] },
  },
  {
    key: "past", label: "Dates too far in the past", typeCode: "CL", from: "2026-09-10", to: "2026-09-10", reason: "Forgot to apply earlier",
    plan: { errors: [{ code: "too_far_back", days: 30 }], days: 1, paid_days: 1, lop_days: 0, available: 8, pending: 0, balance_after: 7, needs_conversion: false, excess: 0, requires_document: false,
      breakdown: [day("2026-09-10", "Thu")] },
  },
];

/** Which preview pages exist (the shell shows the others as "soon"). */
export const PREVIEW_ENABLED = ["home", "leave", "attendance"];

const od = (day: string, status: DayStatusKey, extra: Partial<DayRow> = {}): DayRow => ({
  day, status, is_wfh: false, is_late: false, worked_minutes: null, missing_checkout: false,
  check_in: null, check_out: null, leave_type_code: null, off_name: null, ...extra,
});
const worked = (day: string, inT: string, outT: string, mins: number, extra: Partial<DayRow> = {}, status: DayStatusKey = "present") =>
  od(day, status, { check_in: `${day}T${inT}+05:30`, check_out: `${day}T${outT}+05:30`, worked_minutes: mins, ...extra });

// October 2026 for a head-office employee. Sample rows shaped like day_status() output.
const octOverrides: Record<string, DayRow> = {
  "2026-10-01": worked("2026-10-01", "09:50:00", "18:05:00", 495),
  "2026-10-02": od("2026-10-02", "holiday", { off_name: "Gandhi Jayanti" }),
  "2026-10-05": worked("2026-10-05", "09:58:00", "18:10:00", 492),
  "2026-10-06": worked("2026-10-06", "10:22:00", "18:30:00", 488, { is_late: true }),
  "2026-10-07": worked("2026-10-07", "09:40:00", "14:00:00", 260, {}, "half_day"),
  "2026-10-08": od("2026-10-08", "present", { is_wfh: true }),  // approved WFH: 1.0 Present, no punches needed
  "2026-10-09": od("2026-10-09", "absent", { check_in: "2026-10-09T09:30:00+05:30", missing_checkout: true }),
  "2026-10-12": worked("2026-10-12", "09:55:00", "18:00:00", 485),
  "2026-10-13": worked("2026-10-13", "10:31:00", "18:40:00", 489, { is_late: true }),
  "2026-10-14": od("2026-10-14", "absent"),
  "2026-10-15": od("2026-10-15", "on_leave", { leave_type_code: "CL" }),
  "2026-10-16": od("2026-10-16", "in_progress", { check_in: "2026-10-16T09:58:00+05:30" }),
  "2026-10-19": od("2026-10-19", "future", { pending_request: "WFH pending approval" }),  // pending has no effect (AR-7)
  "2026-10-20": od("2026-10-20", "holiday", { off_name: "Optional One (your optional holiday)" }),
  "2026-10-22": od("2026-10-22", "future", { pending_request: "CL pending approval" }),
  "2026-10-23": od("2026-10-23", "future", { pending_request: "CL pending approval" }),
};

export const attendanceMonth: DayRow[] = Array.from({ length: 31 }, (_, i) => {
  const day = `2026-10-${String(i + 1).padStart(2, "0")}`;
  if (octOverrides[day]) return octOverrides[day];
  return od(day, isoWeekday(day) >= 6 ? "weekly_off" : "future");
});

export const attendanceSummary: MonthSummary = { present: 5, wfh: 1, half: 1, absent: 2, leave: 1, lateMarks: 2, lateLimit: 3 };

export const sampleRequests = [
  { id: "r1", kind: "Regularisation", text: "Wed 14 Oct · 9:55 am to 6:00 pm", status: "Pending" },
  { id: "r2", kind: "WFH", text: "Mon 19 Oct", status: "Pending" },
];
