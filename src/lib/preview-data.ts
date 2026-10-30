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
  team: { present: 6, wfh: 1, leave: 1, notIn: 1, decisions: 6 },
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
export const PREVIEW_ENABLED = ["home", "leave", "attendance", "approvals", "holidays", "profile", "employees", "team", "teamleave", "reports", "settings"];

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

// My leave (S7) sample data, shaped like leave_balances() and the leave_requests table.
export const leaveBalanceRows = [
  { code: "CL", name: "Casual Leave", opening: 0, accrued: 8, adjusted: 0, used: 0, pending: 2, available: 8 },
  { code: "SL", name: "Sick Leave", opening: 0, accrued: 7, adjusted: 0, used: 0, pending: 0, available: 7 },
  { code: "EL", name: "Earned Leave", opening: 13.75, accrued: 11.25, adjusted: 0, used: 0, pending: 0, available: 25 },
];
export const lopTaken = 1;

export type LeaveHistoryRow = {
  id: string; type: string; from: string; to: string; days: number; lopDays: number;
  status: "pending" | "approved" | "rejected" | "cancelled"; comment: string | null; decidedBy: string | null; attachment: boolean;
};
export const leaveHistory: LeaveHistoryRow[] = [
  { id: "l1", type: "CL", from: "2026-10-22", to: "2026-10-23", days: 2, lopDays: 0, status: "pending", comment: null, decidedBy: null, attachment: false },
  { id: "l2", type: "EL", from: "2026-12-07", to: "2026-12-09", days: 3, lopDays: 0, status: "approved", comment: "Enjoy the break", decidedBy: "Mohan Manager", attachment: false },
  { id: "l3", type: "CL", from: "2026-09-03", to: "2026-09-04", days: 2, lopDays: 0, status: "approved", comment: "Approved", decidedBy: "Mohan Manager", attachment: false },
  { id: "l4", type: "SL", from: "2026-08-18", to: "2026-08-20", days: 3, lopDays: 0, status: "approved", comment: null, decidedBy: "Mohan Manager", attachment: true },
  { id: "l5", type: "CL", from: "2026-07-10", to: "2026-07-10", days: 1, lopDays: 0, status: "rejected", comment: "Team is short-staffed that day", decidedBy: "Mohan Manager", attachment: false },
  { id: "l6", type: "LOP", from: "2026-06-12", to: "2026-06-12", days: 1, lopDays: 1, status: "approved", comment: null, decidedBy: "Mohan Manager", attachment: false },
  { id: "l7", type: "CL", from: "2026-06-01", to: "2026-06-01", days: 1, lopDays: 0, status: "cancelled", comment: null, decidedBy: null, attachment: false },
];

// Approvals inbox (S9) sample data, shaped like pending_approvals(). `failsOnApprove` simulates the database
// refusing an approval (for example the balance is no longer sufficient) so the error state can be seen.
export type ApprovalItem =
  | { kind: "leave"; id: string; code: string; name: string; type: string; from: string; to: string; days: number; reason: string;
      available: number; after: number; clashes: string[]; attachment: boolean; attachmentPath?: string | null; failsOnApprove?: string }
  | { kind: "regularisation"; id: string; code: string; name: string; workDate: string; inIso: string; outIso: string; reason: string }
  | { kind: "wfh"; id: string; code: string; name: string; workDate: string; reason: string }
  | { kind: "optional_holiday"; id: string; code: string; name: string; holiday: string; date: string; leftAfter: number };

export const approvalItems: ApprovalItem[] = [
  { kind: "leave", id: "a1", code: "KCF0007", name: "Asha Naik", type: "CL", from: "2026-10-23", to: "2026-10-27", days: 3, reason: "Family function",
    available: 8, after: 5, clashes: ["Ravi Kamat"], attachment: false },
  { kind: "leave", id: "a2", code: "KCF0009", name: "Ravi Kamat", type: "SL", from: "2026-10-26", to: "2026-10-28", days: 3, reason: "Viral fever, doctor advised rest",
    available: 7, after: 4, clashes: [], attachment: true },
  { kind: "leave", id: "a3", code: "KCF0014", name: "Meena Fal", type: "CL", from: "2026-11-02", to: "2026-11-06", days: 5, reason: "Visiting my parents",
    available: 3, after: 0, clashes: [], attachment: false, failsOnApprove: "The balance is no longer sufficient. The request stays pending; ask HR to adjust it or ask Meena to convert part to Loss of Pay." },
  { kind: "regularisation", id: "a4", code: "KCF0011", name: "Dinesh Prabhu", workDate: "2026-10-14", inIso: "2026-10-14T09:55:00+05:30", outIso: "2026-10-14T18:00:00+05:30", reason: "Forgot to punch out" },
  { kind: "wfh", id: "a5", code: "KCF0007", name: "Asha Naik", workDate: "2026-10-19", reason: "Plumber visiting home" },
  { kind: "optional_holiday", id: "a6", code: "KCF0009", name: "Ravi Kamat", holiday: "Optional One", date: "2026-10-20", leftAfter: 1 },
];

export const decidedItems = [
  { id: "d1", text: "KCF0011 Dinesh Prabhu · CL 8 Oct", outcome: "approved", comment: "Approved" },
  { id: "d2", text: "KCF0014 Meena Fal · WFH 2 Oct", outcome: "rejected", comment: "Client visit that day" },
];

// Holiday calendar (S11) sample data. The real list is imported by HR from the official Goa notification.
export type HolidayType = "national" | "state" | "optional";
export type HolidayRow = { id: string; site: string; date: string; name: string; type: HolidayType; onWeeklyOff: boolean };
export const holidaySites = [
  { key: "ho" as const, name: "Panaji Head Office", week: "5-day week, Saturday and Sunday off" },
  { key: "plant" as const, name: "Verna Plant", week: "6-day week, Sunday off" },
];
export const holidayRows: HolidayRow[] = [
  { id: "h1", site: "ho", date: "2026-10-02", name: "Gandhi Jayanti", type: "national", onWeeklyOff: false },
  { id: "h2", site: "ho", date: "2026-10-20", name: "Optional One", type: "optional", onWeeklyOff: false },
  { id: "h3", site: "ho", date: "2026-11-04", name: "Optional Two", type: "optional", onWeeklyOff: false },
  { id: "h4", site: "ho", date: "2026-11-05", name: "Optional Three", type: "optional", onWeeklyOff: false },
  { id: "h5", site: "ho", date: "2026-12-19", name: "Goa Liberation Day", type: "state", onWeeklyOff: true },
  { id: "h6", site: "ho", date: "2026-12-25", name: "Christmas", type: "state", onWeeklyOff: false },
  { id: "v1", site: "plant", date: "2026-10-02", name: "Gandhi Jayanti", type: "national", onWeeklyOff: false },
  { id: "v2", site: "plant", date: "2026-11-09", name: "Verna Fest", type: "state", onWeeklyOff: false },
  { id: "v3", site: "plant", date: "2026-11-12", name: "Verna Optional", type: "optional", onWeeklyOff: false },
  { id: "v4", site: "plant", date: "2026-12-19", name: "Goa Liberation Day", type: "state", onWeeklyOff: false },
  { id: "v5", site: "plant", date: "2026-12-25", name: "Christmas", type: "state", onWeeklyOff: false },
];
// The signed-in employee works at Panaji: Optional One is already approved (matches the attendance sample).
export const holidayRequestStart: Record<string, "pending" | "approved"> = { h2: "approved" };
