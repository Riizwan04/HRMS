"use server";

import { requireEmployee } from "@/lib/auth";
import { q, withUser } from "@/lib/db/client";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const MESSAGES: Record<string, string> = {
  not_optional_holiday: "That is not an optional holiday",
  wrong_location: "That holiday belongs to another site",
  date_passed: "That date has already passed",
  on_leave: "You have leave booked on that day",
  optional_quota_exceeded: "You have already chosen your 2 optional holidays for the year",
  duplicate_request: "You have already chosen this holiday",
  cannot_cancel: "This choice can't be cancelled any more",
  forbidden: "Only HR can change the holiday calendar",
  not_hr: "Only HR can change the holiday calendar",
};
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: MESSAGES[(e as Error).message.trim()] ?? "Something went wrong. Please try again." });

export async function requestOptional(i: { holidayId: string }): Promise<Result<{ id: string }>> {
  const me = await requireEmployee();
  try {
    const [[row]] = await withUser({ sub: me.sub }, [q`select public.request_optional_holiday(${i.holidayId}::uuid) as id`]);
    return { ok: true, id: String(row.id) };
  } catch (e) { return fail(e); }
}

/** Cancels my pending (or not-yet-started approved) choice for this holiday. */
export async function cancelOptional(i: { holidayId: string }): Promise<Result> {
  const me = await requireEmployee();
  try {
    const [rows] = await withUser({ sub: me.sub }, [q`select id from public.optional_holiday_requests
       where employee_id = ${me.id}::uuid and holiday_id = ${i.holidayId}::uuid and status in ('pending', 'approved') limit 1`]);
    if (rows.length === 0) return { ok: false, error: MESSAGES.cannot_cancel };
    await withUser({ sub: me.sub }, [q`select public.cancel_request('optional_holiday', ${String(rows[0].id)}::uuid)`]);
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** HR only (the database refuses anyone else). Adding a holiday also releases leave booked on that date (LR-11). */
export async function addHoliday(i: { siteIds: string[]; date: string; name: string; type: "national" | "state" | "optional" }): Promise<Result> {
  const me = await requireEmployee();
  try {
    await withUser({ sub: me.sub }, i.siteIds.map((site) => q`select public.hr_upsert_holiday(
      jsonb_build_object('location_id', ${site}::text, 'holiday_date', ${i.date}::text, 'name', ${i.name.trim()}::text, 'type', ${i.type}::text))`));
    return { ok: true };
  } catch (e) { return fail(e); }
}
