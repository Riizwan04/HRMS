import "server-only";
import { requireEmployee } from "@/lib/auth";
import { q, withUser, type Row } from "@/lib/db/client";
import type { ApprovalItem } from "@/lib/preview-data";
import { todayIST } from "@/lib/time/ist";

// The inbox: pending_approvals() already limits rows to what the caller may decide (direct reports, or everyone for HR).
const num = (x: unknown) => Number(x);

export async function getPendingApprovals(): Promise<ApprovalItem[]> {
  const me = await requireEmployee();
  const year = Number(todayIST().slice(0, 4));
  const [rows] = await withUser({ sub: me.sub }, [q`select kind, id, employee_id, employee_code, employee_name, summary from public.pending_approvals()`]);

  // Leave rows need the requester's balance (before / after); optional holidays need how many they have used.
  const extra = await Promise.all(rows.map(async (r) => {
    if (r.kind === "leave") {
      const code = (r.summary as Row).type_code as string;
      const [[b]] = await withUser({ sub: me.sub }, [q`select available from public.leave_balances(${r.employee_id}::uuid, ${year}::int) where code = ${code}::text`]);
      return { available: b ? num(b.available) : 0 };
    }
    if (r.kind === "optional_holiday") {
      const [[c]] = await withUser({ sub: me.sub }, [q`select count(*)::int as n from public.optional_holiday_requests where employee_id = ${r.employee_id}::uuid and status = 'approved'`]);
      return { used: num(c.n) };
    }
    return {};
  }));

  return rows.map((r, i): ApprovalItem => {
    const s = r.summary as Record<string, unknown>;
    const base = { id: String(r.id), code: String(r.employee_code), name: String(r.employee_name) };
    switch (r.kind) {
      case "leave": {
        const available = (extra[i] as { available: number }).available;
        const paid = num(s.days) - num(s.lop_days);
        return { kind: "leave", ...base, type: String(s.type_code), from: String(s.from), to: String(s.to), days: num(s.days), reason: String(s.reason),
          available, after: Math.max(available - paid, 0), clashes: (s.clashes as string[]) ?? [], attachment: Boolean(s.attachment), attachmentPath: (s.attachment as string | null) ?? null };
      }
      case "regularisation":
        return { kind: "regularisation", ...base, workDate: String(s.work_date), inIso: String(s.requested_in), outIso: String(s.requested_out), reason: String(s.reason) };
      case "wfh":
        return { kind: "wfh", ...base, workDate: String(s.work_date), reason: String(s.reason) };
      default: {
        const used = (extra[i] as { used: number }).used;
        return { kind: "optional_holiday", ...base, holiday: String(s.holiday), date: String(s.holiday_date), leftAfter: Math.max(2 - used - 1, 0) };
      }
    }
  });
}
