import type { LeavePlan } from "./leave-plan";

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
