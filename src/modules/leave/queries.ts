import "server-only";
import { requireEmployee } from "@/lib/auth";
import { q, withUser } from "@/lib/db/client";
import type { LeaveHistoryRow } from "@/lib/preview-data";

// Reads for the leave screens. Every rule (balance, working days) is computed by the database functions; this only shapes rows.
const num = (x: unknown) => Number(x);

export type LeaveBalance = { typeId: string; code: string; name: string; opening: number; accrued: number; adjusted: number; used: number; pending: number; available: number };
export type LeaveTypeOption = { id: string; code: string; name: string; halfDayAllowed: boolean; docOverDays: number | null; eventBased: boolean };

export async function getBalances(year: number): Promise<LeaveBalance[]> {
  const me = await requireEmployee();
  const [rows] = await withUser({ sub: me.sub }, [q`select * from public.leave_balances(${me.id}::uuid, ${year}::int)`]);
  return rows.map((r) => ({
    typeId: String(r.leave_type_id), code: String(r.code), name: String(r.name), opening: num(r.opening), accrued: num(r.accrued),
    adjusted: num(r.adjusted), used: num(r.used), pending: num(r.pending), available: num(r.available),
  }));
}

export async function getLeaveTypes(year: number): Promise<LeaveTypeOption[]> {
  const me = await requireEmployee();
  const [rows] = await withUser({ sub: me.sub }, [q`select * from public.my_leave_types(${year}::int)`]);
  return rows.map((r) => ({
    id: String(r.id), code: String(r.code), name: String(r.name), halfDayAllowed: Boolean(r.half_day_allowed),
    docOverDays: r.doc_required_over_days === null ? null : num(r.doc_required_over_days), eventBased: Boolean(r.is_event_based),
  }));
}

export async function getHistory(year: number): Promise<LeaveHistoryRow[]> {
  const me = await requireEmployee();
  const [rows] = await withUser({ sub: me.sub }, [q`select id, type_code, from_date::text as from_date, to_date::text as to_date, days, lop_days, status,
      approver_comment, decided_by_name, has_attachment from public.my_leave_history(${year}::int)`]);
  return rows.map((r) => ({
    id: String(r.id), type: String(r.type_code), from: String(r.from_date), to: String(r.to_date), days: num(r.days), lopDays: num(r.lop_days),
    status: r.status as LeaveHistoryRow["status"], comment: (r.approver_comment as string | null) ?? null,
    decidedBy: (r.decided_by_name as string | null) ?? null, attachment: Boolean(r.has_attachment),
  }));
}

export async function getLopTaken(year: number): Promise<number> {
  const me = await requireEmployee();
  const [[row]] = await withUser({ sub: me.sub }, [q`select public.my_lop_taken(${year}::int) as v`]);
  return num(row.v);
}
