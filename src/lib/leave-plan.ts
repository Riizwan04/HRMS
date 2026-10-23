// The shape returned by the database function preview_leave() (ARCHITECTURE.md 6.1) and its error messages
// (DESIGN.md section 6). The rules themselves live ONLY in the database; this file just describes and words them.
export type PlanError =
  | { code: "insufficient_balance"; available: number; requested: number; excess: number }
  | { code: "document_required" }
  | { code: "too_far_back"; days: number }
  | { code: "overlap"; dates: string[] }
  | { code: "exceeds_max_days"; max: number }
  | { code: "half_day_not_allowed" | "half_day_single_date" | "half_day_session_required" | "invalid_range"
        | "no_working_days" | "before_joining" | "after_last_working_day" | "type_not_applicable"
        | "min_service" | "range_too_large" | "unknown_type" };

export type BreakdownDay = {
  date: string; weekday: string; counts: boolean;
  reason: "weekly_off" | "holiday" | "optional_holiday" | null; name: string | null;
};

export type LeavePlan = {
  errors: PlanError[];
  days: number; paid_days: number; lop_days: number;
  breakdown: BreakdownDay[];
  available: number | null; pending: number | null; balance_after: number | null;
  needs_conversion: boolean; excess: number; requires_document: boolean;
};

const n = (x: number) => (Number.isInteger(x) ? x.toFixed(1) : String(x));

export function planErrorMessage(e: PlanError, leaveCode = "CL"): string {
  switch (e.code) {
    case "insufficient_balance":
      return `You have ${n(e.available)} ${leaveCode} available but need ${n(e.requested)}. Convert ${e.excess} day${e.excess === 1 ? "" : "s"} to Loss of Pay?`;
    case "document_required":
      return leaveCode === "SL" ? "A medical certificate is required for sick leave longer than 2 days" : "A supporting document is required for this leave";
    case "too_far_back": return `Leave can't be applied for dates more than ${e.days} days in the past`;
    case "overlap": return `You already have leave on ${e.dates.join(", ")}`;
    case "exceeds_max_days": return `This leave type allows at most ${n(e.max)} days in one request`;
    case "half_day_not_allowed": return "This leave type can't be taken as a half day";
    case "half_day_single_date": return "Half day is available for one date only";
    case "half_day_session_required": return "Choose first half or second half";
    case "invalid_range": return "End date must be on or after start date";
    case "no_working_days": return "There are no working days in this range";
    case "before_joining": return "Leave can't start before your joining date";
    case "after_last_working_day": return "Leave can't extend beyond your last working day";
    case "type_not_applicable": return "This leave type isn't available for you";
    case "min_service": return "You haven't completed the minimum service needed for this leave";
    case "range_too_large": return "Please choose a shorter date range";
    default: return "This request can't be submitted";
  }
}
