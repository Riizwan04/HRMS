import "server-only";
import { requireEmployee } from "@/lib/auth";
import { q, withUser } from "@/lib/db/client";
import { todayIST } from "@/lib/time/ist";

// Configuration reads (HR screen). The writes live in actions.ts and call the hr_* functions, which refuse anyone who is not HR.
export type LeaveTypeCfg = { id: string; code: string; name: string; paid: boolean; eventBased: boolean; year: number; annualQuota: number | null; accrual: string; accrualPerMonth: number | null; carryForwardMax: number | null; halfDay: boolean; docOverDays: number | null; maxPerRequest: number | null; minServiceDays: number | null };
export type LocationCfg = { id: string; name: string; city: string; state: string; active: boolean; weeklyOffs: number[] };
export type DepartmentCfg = { id: string; name: string; active: boolean; people: number };
const nn = (x: unknown) => (x === null || x === undefined ? null : Number(x));

export async function getSettings(asOf: string = todayIST()): Promise<{ leaveTypes: LeaveTypeCfg[]; locations: LocationCfg[]; departments: DepartmentCfg[]; year: number }> {
  const me = await requireEmployee();
  const [types, locs, deps, [yr]] = await withUser({ sub: me.sub }, [
    q`select t.id, t.code, t.name, t.is_paid, t.is_event_based, r.effective_from_year, r.annual_quota, r.accrual_method::text as accrual, r.accrual_per_month, r.carry_forward_max,
             r.half_day_allowed, r.doc_required_over_days, r.max_days_per_request, r.min_service_days
        from public.leave_types t left join lateral (select * from public.leave_type_rules x where x.leave_type_id = t.id and x.effective_from_year <= extract(year from ${asOf}::date)::int
                                                      order by x.effective_from_year desc limit 1) r on true
       where t.is_active order by case t.code when 'CL' then 1 when 'SL' then 2 when 'EL' then 3 else 9 end, t.code`,
    q`select l.id, l.name, l.city, l.state_code, l.is_active,
             (select w.weekly_off_days from public.location_weekly_offs w where w.location_id = l.id and w.effective_from <= ${asOf}::date order by w.effective_from desc limit 1) as offs
        from public.locations l order by l.name`,
    q`select d.id, d.name, d.is_active, (select count(*)::int from public.employees e where e.department_id = d.id and e.status = 'active') as people from public.departments d order by d.name`,
    q`select extract(year from ${asOf}::date)::int as y`,
  ]);
  return {
    year: Number(yr.y),
    leaveTypes: types.map((r) => ({ id: String(r.id), code: String(r.code), name: String(r.name), paid: Boolean(r.is_paid), eventBased: Boolean(r.is_event_based), year: Number(r.effective_from_year ?? yr.y),
      annualQuota: nn(r.annual_quota), accrual: String(r.accrual ?? "none"), accrualPerMonth: nn(r.accrual_per_month), carryForwardMax: nn(r.carry_forward_max), halfDay: Boolean(r.half_day_allowed),
      docOverDays: nn(r.doc_required_over_days), maxPerRequest: nn(r.max_days_per_request), minServiceDays: nn(r.min_service_days) })),
    locations: locs.map((r) => ({ id: String(r.id), name: String(r.name), city: String(r.city), state: String(r.state_code), active: Boolean(r.is_active), weeklyOffs: ((r.offs as number[] | null) ?? []).map(Number) })),
    departments: deps.map((r) => ({ id: String(r.id), name: String(r.name), active: Boolean(r.is_active), people: Number(r.people) })),
  };
}
