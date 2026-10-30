"use server";

import { requireEmployee } from "@/lib/auth";
import { q, withUser } from "@/lib/db/client";
import { istInstant } from "@/lib/time/ist";

// Writes for attendance. The acting employee comes from the verified session; the database enforces every rule (AR-*).
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const MESSAGES: Record<string, string> = {
  no_check_in: "You haven't checked in today",
  reason_required: "Please give a reason (at least 5 characters)",
  date_in_past: "WFH can only be requested for today or a future date",
  not_employed: "That date is outside your employment period",
  not_working_day: "That day is a weekly off or holiday",
  on_leave: "You have approved leave on that day",
  duplicate_request: "You already have a pending request for this date",
  outside_window: "Corrections can only be requested for the last 30 days",
  time_not_on_date: "The check-in time must be on the selected date",
  out_before_in: "Check-out must be after check-in",
  cannot_cancel: "This request can't be cancelled",
  not_optional_holiday: "That is not an optional holiday",
  wrong_location: "That holiday belongs to another site",
  date_passed: "That date has already passed",
  optional_quota_exceeded: "You have already chosen your 2 optional holidays for the year",
  not_found: "This request no longer exists",
};
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: MESSAGES[(e as Error).message.trim()] ?? "Something went wrong. Please try again." });

export async function checkIn(): Promise<Result<{ created: boolean }>> {
  const me = await requireEmployee();
  try {
    const [[row]] = await withUser({ sub: me.sub }, [q`select public.check_in() as r`]);
    return { ok: true, created: Boolean((row.r as { created: boolean }).created) };
  } catch (e) { return fail(e); }
}

export async function checkOut(): Promise<Result> {
  const me = await requireEmployee();
  try {
    await withUser({ sub: me.sub }, [q`select public.check_out()`]);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function requestWfh(i: { date: string; reason: string }): Promise<Result<{ id: string }>> {
  const me = await requireEmployee();
  try {
    const [[row]] = await withUser({ sub: me.sub }, [q`select public.request_wfh(${i.date}::date, ${i.reason}::text) as id`]);
    return { ok: true, id: String(row.id) };
  } catch (e) { return fail(e); }
}

/** Times are entered in IST on the given date; the database stores exact instants. */
export async function requestRegularisation(i: { date: string; inTime: string; outTime: string | null; reason: string }): Promise<Result<{ id: string }>> {
  const me = await requireEmployee();
  try {
    const inAt = istInstant(i.date, i.inTime);
    const outAt = i.outTime ? istInstant(i.date, i.outTime) : null;
    const [[row]] = await withUser({ sub: me.sub }, [q`select public.request_regularisation(${i.date}::date, ${inAt}::timestamptz, ${outAt}::timestamptz, ${i.reason}::text) as id`]);
    return { ok: true, id: String(row.id) };
  } catch (e) { return fail(e); }
}

export async function cancelRequest(i: { kind: "wfh" | "regularisation" | "optional_holiday"; id: string }): Promise<Result> {
  const me = await requireEmployee();
  try {
    await withUser({ sub: me.sub }, [q`select public.cancel_request(${i.kind}::text, ${i.id}::uuid)`]);
    return { ok: true };
  } catch (e) { return fail(e); }
}
