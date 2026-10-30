import "server-only";
import { requireEmployee } from "@/lib/auth";
import { q, withUser } from "@/lib/db/client";
import type { DayRow, MonthSummary } from "@/lib/attendance-types";
import { todayIST } from "@/lib/time/ist";

// Reads for the attendance screens. Day status (Present / Half Day / Late ...) is computed by the database function day_status().
const iso = (col: string) => `to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
const DAY_COLS = `day::text as day, status, is_wfh, is_late, worked_minutes, missing_checkout, ${iso("check_in")} as check_in,
  ${iso("check_out")} as check_out, leave_type_code, off_name`;

function toRow(r: Record<string, unknown>): DayRow {
  return {
    day: String(r.day), status: r.status as DayRow["status"], is_wfh: Boolean(r.is_wfh), is_late: Boolean(r.is_late),
    worked_minutes: r.worked_minutes === null ? null : Number(r.worked_minutes), missing_checkout: Boolean(r.missing_checkout),
    check_in: (r.check_in as string | null) ?? null, check_out: (r.check_out as string | null) ?? null,
    leave_type_code: (r.leave_type_code as string | null) ?? null, off_name: (r.off_name as string | null) ?? null,
  };
}

/** One row per day of the month containing `monthStart` ("YYYY-MM-01"), with a note on days that have a pending request. */
export async function getMonthRows(monthStart: string): Promise<DayRow[]> {
  const me = await requireEmployee();
  const [days, pend] = await withUser({ sub: me.sub }, [
    { text: `select ${DAY_COLS} from public.day_status($1::uuid, $2::date, ($2::date + interval '1 month' - interval '1 day')::date)`, values: [me.id, monthStart] },
    q`select work_date::text as d, 'WFH requested' as note from public.wfh_requests
        where employee_id = ${me.id}::uuid and status = 'pending' and to_char(work_date, 'YYYY-MM') = ${monthStart.slice(0, 7)}::text
      union all
      select work_date::text, 'Correction requested' from public.regularisation_requests
        where employee_id = ${me.id}::uuid and status = 'pending' and to_char(work_date, 'YYYY-MM') = ${monthStart.slice(0, 7)}::text`,
  ]);
  const notes = new Map(pend.map((p) => [String(p.d), String(p.note)]));
  return days.map((r) => ({ ...toRow(r), pending_request: notes.get(String(r.day)) ?? null }));
}

/** Today's row (status, punch times). */
export async function getToday(): Promise<DayRow> {
  const me = await requireEmployee();
  const today = todayIST();
  const [rows] = await withUser({ sub: me.sub }, [{ text: `select ${DAY_COLS} from public.day_status($1::uuid, $2::date, $2::date)`, values: [me.id, today] }]);
  return toRow(rows[0]);
}

/** The "Late marks of N" limit, from the stored policy setting (AR-6). */
export async function getLateLimit(): Promise<number> {
  const me = await requireEmployee();
  const [[row]] = await withUser({ sub: me.sub }, [q`select value from public.policy_settings where key = 'late_marks_per_half_day'`]);
  return Number(row?.value ?? 3);
}

/** Counts the database's own day rows for the month header; no rule is re-implemented here. */
export function getSummary(rows: DayRow[], lateLimit: number): MonthSummary {
  const n = (f: (r: DayRow) => boolean) => rows.filter(f).length;
  return {
    present: n((r) => r.status === "present" && !r.is_wfh), wfh: n((r) => r.status === "present" && r.is_wfh),
    half: n((r) => r.status === "half_day"), absent: n((r) => r.status === "absent"), leave: n((r) => r.status === "on_leave"),
    lateMarks: n((r) => r.is_late), lateLimit,
  };
}

export type MyRequest = { id: string; kind: string; text: string; status: string };

/** My WFH, regularisation and optional-holiday requests, newest first. */
export async function getMyRequests(): Promise<MyRequest[]> {
  const me = await requireEmployee();
  const [rows] = await withUser({ sub: me.sub }, [q`
    select * from (
      select w.id, 'WFH' as kind, to_char(w.work_date, 'Dy DD Mon') as text, w.status::text as status, w.created_at from public.wfh_requests w where w.employee_id = ${me.id}::uuid
      union all
      select g.id, 'Regularisation', to_char(g.work_date, 'Dy DD Mon'), g.status::text, g.created_at from public.regularisation_requests g where g.employee_id = ${me.id}::uuid
      union all
      select o.id, 'Optional holiday', h.name || ' ' || to_char(h.holiday_date, 'DD Mon'), o.status::text, o.created_at
        from public.optional_holiday_requests o join public.holidays h on h.id = o.holiday_id where o.employee_id = ${me.id}::uuid
    ) x order by created_at desc limit 20`]);
  return rows.map((r) => ({ id: String(r.id), kind: String(r.kind), text: String(r.text), status: String(r.status) }));
}

export type TeamToday = { present: number; wfh: number; leave: number; notIn: number; total: number };

/** Today's picture of the people the caller manages (HR: everyone). Statuses come from day_status(). */
export async function getTeamToday(): Promise<TeamToday> {
  const me = await requireEmployee();
  const [rows] = await withUser({ sub: me.sub }, [q`select s.status, s.is_wfh, count(*)::int as n
      from public.team_members() m cross join lateral public.day_status(m.id, ${todayIST()}::date, ${todayIST()}::date) s
      where m.id <> ${me.id}::uuid group by 1, 2`]);
  const sum = (f: (r: { status: string; is_wfh: boolean }) => boolean) =>
    rows.filter((r) => f({ status: String(r.status), is_wfh: Boolean(r.is_wfh) })).reduce((a, r) => a + Number(r.n), 0);
  const present = sum((r) => (r.status === "present" || r.status === "in_progress" || r.status === "half_day") && !r.is_wfh);
  const wfh = sum((r) => r.status === "present" && r.is_wfh);
  const leave = sum((r) => r.status === "on_leave");
  const notIn = sum((r) => r.status === "pending" || r.status === "absent");
  return { present, wfh, leave, notIn, total: present + wfh + leave + notIn };
}

export type OrgToday = { active: number; onLeave: number; absent: number; notSignedIn: number; missingOut: number };

/** HR only: organisation counts for today (the database refuses everyone else's view of other people's rows). */
export async function getOrgToday(): Promise<OrgToday> {
  const me = await requireEmployee();
  const day = todayIST();
  const [[a], [b]] = await withUser({ sub: me.sub }, [
    q`select count(*)::int as active, count(*) filter (where clerk_user_id is null)::int as unlinked from public.employees where status = 'active'`,
    q`select count(*) filter (where s.status = 'on_leave')::int as on_leave, count(*) filter (where s.status = 'absent' and s.day = ${day}::date)::int as absent,
             count(*) filter (where s.missing_checkout)::int as missing
        from public.employees e cross join lateral public.day_status(e.id, ${day}::date, ${day}::date) s where e.status = 'active'`,
  ]);
  return { active: Number(a.active), notSignedIn: Number(a.unlinked), onLeave: Number(b.on_leave), absent: Number(b.absent), missingOut: Number(b.missing) };
}
