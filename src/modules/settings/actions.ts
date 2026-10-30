"use server";

import { requireEmployee } from "@/lib/auth";
import { q, withUser } from "@/lib/db/client";

type Result = { ok: true } | { ok: false; error: string };
const MESSAGES: Record<string, string> = {
  forbidden: "Only HR can change the settings",
  department_in_use: "Move the active employees to another department first",
  past_year_readonly: "Rules for past years can't be changed",
  month_exported: "That month was already exported for payroll, so weekly offs can't change from then",
};
function fail(e: unknown): { ok: false; error: string } {
  const m = (e as Error).message.trim();
  if (MESSAGES[m]) return { ok: false, error: MESSAGES[m] };
  if (/duplicate key|unique/i.test(m)) return { ok: false, error: "That name is already in use" };
  if (/violates check constraint/.test(m)) return { ok: false, error: "One of the values is not valid. Please check them" };
  return { ok: false, error: "Something went wrong. Please try again." };
}
const j = (o: Record<string, unknown>) => JSON.stringify(o);

export async function saveDepartment(i: { id?: string; name: string; active?: boolean }): Promise<Result> {
  const me = await requireEmployee();
  if (!i.name.trim()) return { ok: false, error: "Enter a name" };
  try {
    await withUser({ sub: me.sub }, [q`select public.hr_upsert_department(${j({ id: i.id ?? "", name: i.name.trim(), ...(i.active === undefined ? {} : { is_active: i.active }) })}::jsonb)`]);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function saveLocation(i: { id?: string; name: string; city: string; state: string; active?: boolean }): Promise<Result> {
  const me = await requireEmployee();
  if (!i.name.trim() || !i.city.trim() || !i.state) return { ok: false, error: "Enter the name, city and state" };
  try {
    await withUser({ sub: me.sub }, [q`select public.hr_upsert_location(${j({ id: i.id ?? "", name: i.name.trim(), city: i.city.trim(), state_code: i.state, ...(i.active === undefined ? {} : { is_active: i.active }) })}::jsonb)`]);
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Days are ISO weekdays (Mon=1 .. Sun=7). Takes effect from the given date and releases any leave that now falls on a weekly off. */
export async function setWeeklyOffs(i: { locationId: string; days: number[]; effective: string }): Promise<Result> {
  const me = await requireEmployee();
  if (i.days.length === 0) return { ok: false, error: "Choose at least one weekly off day" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.effective)) return { ok: false, error: "Choose the date it starts from" };
  try {
    await withUser({ sub: me.sub }, [q`select public.hr_set_weekly_offs(${i.locationId}::uuid, ${`{${[...new Set(i.days)].sort().join(",")}}`}::smallint[], ${i.effective}::date)`]);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function saveLeaveRule(i: { typeId: string; year: number; annualQuota: number | null; accrual: string; accrualPerMonth: number | null; carryForwardMax: number | null; halfDay: boolean; docOverDays: number | null; maxPerRequest: number | null; minServiceDays: number | null }): Promise<Result> {
  const me = await requireEmployee();
  if (!["upfront_prorated", "monthly", "on_request", "none"].includes(i.accrual)) return { ok: false, error: "Choose how the leave accrues" };
  try {
    await withUser({ sub: me.sub }, [q`select public.hr_upsert_leave_type_rule(${i.typeId}::uuid, ${i.year}::int, ${j({
      annual_quota: i.annualQuota, accrual_method: i.accrual, accrual_per_month: i.accrualPerMonth, carry_forward_max: i.carryForwardMax,
      half_day_allowed: i.halfDay, doc_required_over_days: i.docOverDays, max_days_per_request: i.maxPerRequest, must_be_continuous: false, min_service_days: i.minServiceDays })}::jsonb)`]);
    return { ok: true };
  } catch (e) { return fail(e); }
}
