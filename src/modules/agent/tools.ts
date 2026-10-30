import "server-only";
import { tool } from "ai";
import { z } from "zod";
import type { Me } from "@/lib/auth";
import { q, withUser } from "@/lib/db/client";
import { planErrorMessage } from "@/lib/leave-plan";
import { addDays, formatMonth, monthEnd, todayIST } from "@/lib/time/ist";
import { getPendingApprovals } from "@/modules/approvals";
import { getTeamTodayDetail } from "@/modules/attendance";
import { getHolidays } from "@/modules/holidays";
import { getBalances, getLeaveTypes, previewLeave } from "@/modules/leave";

// The assistant's tools. Each is a thin call to a server function or database function the screens already use, run AS the signed-in
// user (withUser), so the same role checks and row-level security apply. There is no approve, reject or cancel tool, and no tool
// reads Aadhaar, PAN or bank data. Every call is counted (max 5 per question) and logged to agent_log.

export const MAX_TOOL_CALLS = 5;
export type CallRecord = { tool: string; input: unknown; outcome: "ok" | "denied" | "error" | "limit_exceeded" };
export type DraftInfo = { id: string; kind: "leave_request" | "hr_reminder_email"; summary: string };
export type Tracker = { calls: CallRecord[]; drafts: DraftInfo[]; count: number };
export type AgentCtx = { me: Me; conversationId: string };
export const newTracker = (): Tracker => ({ calls: [], drafts: [], count: 0 });

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const MONTH = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "use YYYY-MM");

function clip(v: unknown): unknown {
  const s = JSON.stringify(v ?? null);
  return s.length > 4000 ? { truncated: true, preview: s.slice(0, 4000) } : v ?? null;
}

async function log(ctx: AgentCtx, name: string, input: unknown, result: unknown, outcome: CallRecord["outcome"], ms: number) {
  await withUser({ sub: ctx.me.sub }, [q`insert into public.agent_log(employee_id, conversation_id, tool, inputs, result, outcome, latency_ms)
    values (${ctx.me.id}::uuid, ${ctx.conversationId}::uuid, ${name}::text, ${JSON.stringify(clip(input))}::jsonb, ${JSON.stringify(clip(result))}::jsonb, ${outcome}::text, ${Math.round(ms)}::int)`]);
}

/** Counts, limits, role-checks and logs one tool call. Errors are returned to the model as data, never thrown past the loop. */
async function guarded<O>(ctx: AgentCtx, t: Tracker, name: string, input: unknown, needs: "any" | "approver" | "hr", fn: () => Promise<O>): Promise<O | { error: string }> {
  const t0 = performance.now();
  const record = async (outcome: CallRecord["outcome"], result: unknown) => {
    t.calls.push({ tool: name, input, outcome });
    await log(ctx, name, input, result, outcome, performance.now() - t0);
  };
  if (t.count >= MAX_TOOL_CALLS) {
    const r = { error: "Tool call limit reached for this question. Tell the user you cannot look up more and ask them to ask a new question." };
    await record("limit_exceeded", r); return r;
  }
  t.count += 1;
  const role = ctx.me.role;
  if ((needs === "approver" && role === "employee") || (needs === "hr" && role !== "hr")) {
    const r = { error: "You are not allowed to use this tool." };
    await record("denied", r); return r;
  }
  try {
    const out = await fn();
    await record("ok", out); return out;
  } catch (e) {
    const r = { error: (e as Error).message.trim().slice(0, 200) };
    await record("error", r); return r;
  }
}

export function buildTools(ctx: AgentCtx, t: Tracker) {
  const year = Number(todayIST().slice(0, 4));

  const base = {
    get_my_leave_balance: tool({
      description: "Get the signed-in user's leave balance for this year: for each leave type the available days, pending days and used days. Use for any question about how much leave they have. Never guess a balance.",
      inputSchema: z.object({}),
      execute: () => guarded(ctx, t, "get_my_leave_balance", {}, "any", async () =>
        (await getBalances(year)).map((b) => ({ type: b.code, name: b.name, available: b.available, pending: b.pending, used: b.used }))),
    }),

    get_holidays: tool({
      description: "List the holidays at the user's own work location for one month (type is national, state or optional). Use for questions like 'is there a holiday in November'.",
      inputSchema: z.object({ month: MONTH.describe("The month, YYYY-MM") }),
      execute: (i) => guarded(ctx, t, "get_holidays", i, "any", async () => {
        const { holidays } = await getHolidays(Number(i.month.slice(0, 4)));
        return { location: ctx.me.locationName, holidays: holidays.filter((h) => h.site === ctx.me.locationId && h.date.startsWith(i.month)).map((h) => ({ date: h.date, name: h.name, type: h.type })) };
      }),
    }),

    count_working_days: tool({
      description: "Count the leave days between two dates (inclusive) for the signed-in user, skipping their location's weekly offs and holidays. Use this for every question about how many days a leave would be, e.g. Friday to Monday. Never count days yourself.",
      inputSchema: z.object({ from: DATE, to: DATE }),
      execute: (i) => guarded(ctx, t, "count_working_days", i, "any", async () => {
        const [rows] = await withUser({ sub: ctx.me.sub }, [q`select day::text as day, counts, reason, name from public.count_working_days(${ctx.me.id}::uuid, ${i.from}::date, ${i.to}::date)`]);
        return {
          working_days: rows.filter((r) => r.counts).length,
          skipped: rows.filter((r) => !r.counts).map((r) => ({ date: r.day, reason: r.reason, name: r.name })),
        };
      }),
    }),

    explain_policy: tool({
      description: "Answer a question about the company's leave, attendance, holiday, WFH or regularisation policy from the stored policy text only. Returns the matching policy excerpts, or found=false when the policy says nothing about it.",
      inputSchema: z.object({ question: z.string().min(3).max(300) }),
      execute: (i) => guarded(ctx, t, "explain_policy", i, "any", async () => {
        const [rows] = await withUser({ sub: ctx.me.sub }, [q`select title, body, version from public.search_policy(${i.question}::text)`]);
        return rows.length === 0 ? { found: false } : { found: true, excerpts: rows.map((r) => ({ policy: r.title, version: r.version, text: r.body })) };
      }),
    }),

    draft_leave_request: tool({
      description: "Prepare a leave request for the user to confirm. This only creates a DRAFT; nothing is submitted until the user presses Confirm. Resolve relative dates like 'kal' (tomorrow) from the dates given in the system prompt. If the balance is not enough, call again with convertExcessToLop=true only if the user agrees to unpaid days.",
      inputSchema: z.object({
        leaveType: z.string().describe("Leave type code: CL, SL, EL, LOP, ML or PL"), from: DATE, to: DATE,
        half: z.boolean().optional().describe("Half day (same date only)"), session: z.enum(["first", "second"]).optional(),
        reason: z.string().min(5).max(500), convertExcessToLop: z.boolean().optional(),
      }),
      execute: (i) => guarded(ctx, t, "draft_leave_request", i, "any", async () => {
        const type = (await getLeaveTypes(Number(i.from.slice(0, 4)))).find((x) => x.code === i.leaveType.toUpperCase());
        if (!type) return { drafted: false, error: "That leave type is not available for this user." };
        const plan = await previewLeave({ typeId: type.id, from: i.from, to: i.to, half: i.half, session: i.session ?? null, convert: i.convertExcessToLop ?? false, hasDoc: false });
        if (!plan.can_submit) {
          return { drafted: false, problems: plan.errors.map((e) => planErrorMessage(e, type.code)), needsConversionToLop: plan.needs_conversion, excessDays: plan.excess };
        }
        const [[row]] = await withUser({ sub: ctx.me.sub }, [q`select public.create_draft('leave_request', jsonb_build_object(
            'leave_type_id', ${type.id}::text, 'from_date', ${i.from}::text, 'to_date', ${i.to}::text, 'is_half_day', ${i.half ?? false}::boolean,
            'half_day_session', ${i.session ?? null}::text, 'reason', ${i.reason}::text, 'convert_excess_to_lop', ${i.convertExcessToLop ?? false}::boolean)) as id`]);
        const id = String(row.id);
        const summary = `${type.code} ${i.from === i.to ? i.from : `${i.from} to ${i.to}`}: ${plan.days} day${plan.days === 1 ? "" : "s"}` +
          (plan.lop_days > 0 ? ` (${plan.paid_days} paid + ${plan.lop_days} Loss of Pay)` : "");
        t.drafts.push({ id, kind: "leave_request", summary });
        return { drafted: true, draftId: id, days: plan.days, paidDays: plan.paid_days, lopDays: plan.lop_days, balanceAfter: plan.balance_after, awaitingUserConfirmation: true };
      }),
    }),
  };

  if (ctx.me.role === "employee") return base;

  const approver = {
    get_team_today: tool({
      description: "Who in the signed-in manager's team (HR: everyone) is present, working from home, on leave or not checked in today. Managers and HR only.",
      inputSchema: z.object({}),
      execute: () => guarded(ctx, t, "get_team_today", {}, "approver", async () => {
        const people = await getTeamTodayDetail();
        const names = (f: (p: (typeof people)[number]) => boolean) => people.filter(f).map((p) => p.name);
        return {
          present: names((p) => (p.status === "present" || p.status === "in_progress" || p.status === "half_day") && !p.wfh),
          working_from_home: names((p) => p.status === "present" && p.wfh),
          on_leave: names((p) => p.status === "on_leave"),
          not_checked_in: names((p) => p.status === "pending" || p.status === "absent"),
          weekly_off_or_holiday: names((p) => p.status === "weekly_off" || p.status === "holiday"),
        };
      }),
    }),

    summarise_pending_approvals: tool({
      description: "List the requests waiting for the signed-in manager's (HR: anyone's) decision, with the requester's balance before and after and clash warnings. Managers and HR only. This only reads; you cannot approve or reject.",
      inputSchema: z.object({}),
      execute: () => guarded(ctx, t, "summarise_pending_approvals", {}, "approver", async () =>
        (await getPendingApprovals()).slice(0, 15).map((a) => a.kind === "leave"
          ? { kind: a.kind, employee: a.name, type: a.type, from: a.from, to: a.to, days: a.days, balanceBefore: a.available, balanceAfter: a.after, alsoOnLeave: a.clashes, hasCertificate: a.attachment }
          : a.kind === "wfh" ? { kind: a.kind, employee: a.name, date: a.workDate }
          : a.kind === "regularisation" ? { kind: a.kind, employee: a.name, date: a.workDate }
          : { kind: a.kind, employee: a.name, holiday: a.holiday, date: a.date })),
    }),
  };

  if (ctx.me.role !== "hr") return { ...base, ...approver };

  const hrOnly = {
    month_end_check: tool({
      description: "HR month-end check: finds employees with repeated Late marks or missed check-outs in a month and prepares a reminder email DRAFT for HR to review and confirm. Nothing is sent until HR presses Confirm. HR only.",
      inputSchema: z.object({ month: MONTH.optional().describe("YYYY-MM; defaults to the current month"), minLateMarks: z.number().int().min(1).max(10).optional() }),
      execute: (i) => guarded(ctx, t, "month_end_check", i, "hr", async () => {
        const first = `${i.month ?? todayIST().slice(0, 7)}-01`;
        const minLate = i.minLateMarks ?? 2;
        const [rows] = await withUser({ sub: ctx.me.sub }, [q`
          with s as (select * from public.month_summary(${first}::date)),
               m as (select e.id, count(*) filter (where d.missing_checkout)::int as missing
                       from public.employees e cross join lateral public.day_status(e.id, ${first}::date, ${monthEnd(first)}::date) d
                      where e.status = 'active' group by e.id)
          select s.employee_id, s.employee_code, s.full_name, s.late_marks, coalesce(m.missing, 0) as missing
            from s left join m on m.id = s.employee_id
           where s.late_marks >= ${minLate}::int or coalesce(m.missing, 0) >= 1 order by s.employee_code`]);
        const flagged = rows.map((r) => ({ code: String(r.employee_code), name: String(r.full_name), lateMarks: Number(r.late_marks), missedCheckouts: Number(r.missing) }));
        if (flagged.length === 0) return { month: first.slice(0, 7), flagged, drafted: false };
        const label = formatMonth(first);
        const [[d]] = await withUser({ sub: ctx.me.sub }, [q`select public.create_draft('hr_reminder_email', jsonb_build_object(
            'recipients', ${JSON.stringify(rows.map((r) => String(r.employee_id)))}::jsonb,
            'subject', ${`Attendance reminder for ${label}`}::text,
            'message', ${`Please review your attendance for ${label}. If a punch was missed, request a regularisation within 30 days; repeated Late marks convert into Loss of Pay.`}::text)) as id`]);
        t.drafts.push({ id: String(d.id), kind: "hr_reminder_email", summary: `Reminder email to ${flagged.length} employee${flagged.length === 1 ? "" : "s"} for ${label}` });
        return { month: first.slice(0, 7), flagged, drafted: true, draftId: String(d.id), awaitingUserConfirmation: true };
      }),
    }),
  };
  return { ...base, ...approver, ...hrOnly };
}

export const tomorrow = (): string => addDays(todayIST(), 1);
