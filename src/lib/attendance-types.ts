// Row shape of the database function day_status() (ARCHITECTURE.md 6.1). Statuses are computed in the database only.
export type DayStatusKey =
  | "present" | "half_day" | "absent" | "on_leave" | "holiday" | "weekly_off"
  | "not_employed" | "future" | "pending" | "in_progress";

export type DayRow = {
  day: string; status: DayStatusKey; is_wfh: boolean; is_late: boolean; worked_minutes: number | null;
  missing_checkout: boolean; check_in: string | null; check_out: string | null;
  leave_type_code: string | null; off_name: string | null; pending_request?: string | null;
};

export type MonthSummary = { present: number; wfh: number; half: number; absent: number; leave: number; lateMarks: number; lateLimit: number };
