import "server-only";
import { createHash } from "node:crypto";
import { requireEmployee } from "@/lib/auth";
import { q, withUser } from "@/lib/db/client";
import { csvLine } from "./csv";

// Month-end summary for payroll (L8). month_summary() is the single implementation: HR sees everyone (optionally filtered),
// a manager only their direct reports. No sensitive employee data appears in the report or the CSV.
export type ReportRow = { id: string; code: string; name: string; location: string; daysEmployed: number; present: number; wfh: number; cl: number; sl: number; el: number; ml: number; pl: number; lop: number; holidays: number; weeklyOffs: number; lateMarks: number };
export type ReportFilter = { locationId?: string; departmentId?: string };
const n = (x: unknown) => Number(x);

export async function getMonthReport(month: string, f: ReportFilter): Promise<ReportRow[]> {
  const me = await requireEmployee();
  const [rows] = await withUser({ sub: me.sub }, [q`select * from public.month_summary(${`${month}-01`}::date, nullif(${f.locationId ?? ""}::text, '')::uuid, nullif(${f.departmentId ?? ""}::text, '')::uuid)`]);
  return rows.map((r) => ({
    id: String(r.employee_id), code: String(r.employee_code), name: String(r.full_name), location: String(r.location_name ?? ""), daysEmployed: n(r.days_employed),
    present: n(r.present_days), wfh: n(r.wfh_days), cl: n(r.cl), sl: n(r.sl), el: n(r.el), ml: n(r.ml), pl: n(r.pl), lop: n(r.lop_days),
    holidays: n(r.holidays), weeklyOffs: n(r.weekly_offs), lateMarks: n(r.late_marks),
  }));
}

export const CSV_HEADER = ["Employee code", "Name", "Location", "Days employed", "Days present", "WFH days", "CL", "SL", "EL", "Maternity", "Paternity", "LOP days", "Holidays", "Weekly offs", "Late marks"];

/** Builds the CSV and records the export (who, which month, how many rows, a hash of the content). */
export async function exportMonthCsv(month: string, f: ReportFilter): Promise<{ csv: string; filename: string; rows: number }> {
  const me = await requireEmployee();
  const rows = await getMonthReport(month, f);
  const csv = [csvLine(CSV_HEADER), ...rows.map((r) => csvLine([r.code, r.name, r.location, r.daysEmployed, r.present, r.wfh, r.cl, r.sl, r.el, r.ml, r.pl, r.lop, r.holidays, r.weeklyOffs, r.lateMarks]))].join("\n") + "\n";
  const hash = createHash("sha256").update(csv).digest("hex");
  const scope = me.role === "hr" ? (f.locationId || f.departmentId ? "hr_filtered" : "hr_all") : "manager_team";
  await withUser({ sub: me.sub }, [q`select public.log_month_export(${`${month}-01`}::date, ${scope}::text, ${rows.length}::int, ${hash}::text)`]);
  return { csv, filename: `samudra-attendance-${month}.csv`, rows: rows.length };
}
