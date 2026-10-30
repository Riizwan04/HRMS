import "server-only";
import { requireEmployee } from "@/lib/auth";
import { q, withUser } from "@/lib/db/client";
import type { DayStatusKey } from "@/lib/attendance-types";
import { daysOfMonth } from "@/lib/time/ist";

// Team views for managers (direct reports) and HR (everyone). team_members() and day_status() decide who is visible and what each day is.
export type Member = { id: string; name: string; code: string };
export type TeamMonth = { days: string[]; members: Member[]; cells: Record<string, Record<string, { status: DayStatusKey; wfh: boolean; late: boolean }>> };
export type LeaveCell = { code: string; status: "approved" | "pending"; fraction: number };
export type TeamLeaveMonth = { days: string[]; members: Member[]; cells: Record<string, Record<string, LeaveCell>>; clashes: Record<string, string[]> };

const monthEndOf = (first: string) => daysOfMonth(first).at(-1)!;

export async function getTeamMonth(monthStart: string): Promise<TeamMonth> {
  const me = await requireEmployee();
  const days = daysOfMonth(monthStart);
  const [rows] = await withUser({ sub: me.sub }, [q`select m.id, m.full_name, m.employee_code, s.day::text as day, s.status, s.is_wfh, s.is_late
      from public.team_members() m cross join lateral public.day_status(m.id, ${days[0]}::date, ${days.at(-1)!}::date) s
      where m.id <> ${me.id}::uuid order by m.full_name, s.day`]);
  const members: Member[] = [];
  const cells: TeamMonth["cells"] = {};
  for (const r of rows) {
    const id = String(r.id);
    if (!cells[id]) { cells[id] = {}; members.push({ id, name: String(r.full_name), code: String(r.employee_code) }); }
    cells[id][String(r.day)] = { status: r.status as DayStatusKey, wfh: Boolean(r.is_wfh), late: Boolean(r.is_late) };
  }
  return { days, members, cells };
}

export async function getTeamLeaveMonth(monthStart: string): Promise<TeamLeaveMonth> {
  const me = await requireEmployee();
  const days = daysOfMonth(monthStart);
  const [mem, rows] = await withUser({ sub: me.sub }, [
    q`select id, full_name, employee_code from public.team_members() where id <> ${me.id}::uuid order by full_name`,
    q`select m.id, d.leave_date::text as day, t.code, d.day_fraction, r.status::text as status
        from public.team_members() m join public.leave_request_days d on d.employee_id = m.id and d.is_active
        join public.leave_requests r on r.id = d.request_id and r.status in ('approved', 'pending') join public.leave_types t on t.id = d.leave_type_id
       where m.id <> ${me.id}::uuid and d.leave_date between ${days[0]}::date and ${monthEndOf(days[0])}::date`,
  ]);
  const members = mem.map((r) => ({ id: String(r.id), name: String(r.full_name), code: String(r.employee_code) }));
  const byId = new Map(members.map((m) => [m.id, m.name]));
  const cells: TeamLeaveMonth["cells"] = {};
  const clashes: Record<string, string[]> = {};
  for (const r of rows) {
    const id = String(r.id), day = String(r.day);
    (cells[id] ??= {})[day] = { code: String(r.code), status: r.status as LeaveCell["status"], fraction: Number(r.day_fraction) };
    (clashes[day] ??= []).push(byId.get(id) ?? "");
  }
  return { days, members, cells, clashes };
}
