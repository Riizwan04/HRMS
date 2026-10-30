import { Download } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardBody } from "@/components/ui/card";
import { inputCls } from "@/components/ui/field";
import { requireRole } from "@/lib/auth";
import { dateLineFor } from "@/lib/page-context";
import { PREVIEW_ENABLED } from "@/lib/preview-data";
import { addMonths, formatMonth, monthStart, todayIST } from "@/lib/time/ist";
import { getFormOptions } from "@/modules/employees";
import { getMonthReport } from "@/modules/reports";

export const metadata = { title: "Reports · Kinara" };
const f1 = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string; month?: string; location?: string }> }) {
  const sp = await searchParams;
  const me = await requireRole("manager", sp.role ?? "manager");
  const thisMonth = monthStart(todayIST());
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? "") ? sp.month! : thisMonth.slice(0, 7);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, -i).slice(0, 7));
  const live = !me.demo;
  const [rows, opts] = live ? await Promise.all([getMonthReport(month, { locationId: sp.location }), me.role === "hr" ? getFormOptions() : Promise.resolve(null)]) : [[], null];
  const qs = new URLSearchParams({ month, ...(sp.location ? { location: sp.location } : {}) }).toString();
  return (
    <AppShell demo={me.demo} liveData={live} role={me.role} active="reports" enabled={PREVIEW_ENABLED} userName={me.name} dateLine={dateLineFor(me.demo)}>
      <h1 className="mb-1 text-2xl font-semibold">Reports</h1>
      <p className="mb-4 text-sm text-muted">Month-end attendance summary for payroll: days present, work from home, leave by type, loss of pay, holidays and weekly offs.</p>
      {!live ? (
        <Card><CardBody className="py-10 text-center text-sm text-muted">Reports need the live database. Sign in as a manager or HR Admin to use them.</CardBody></Card>
      ) : (
        <>
          <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
            <div><label htmlFor="month" className="mb-1 block text-sm font-medium">Month</label>
              <select id="month" name="month" defaultValue={month} className={inputCls}>{months.map((m) => <option key={m} value={m}>{formatMonth(`${m}-01`)}</option>)}</select></div>
            {opts && <div><label htmlFor="location" className="mb-1 block text-sm font-medium">Location</label>
              <select id="location" name="location" defaultValue={sp.location ?? ""} className={inputCls}><option value="">All locations</option>{opts.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>}
            <button type="submit" className="h-11 rounded-lg border border-input px-4 font-semibold hover:bg-surface-2">Show</button>
            <a href={`/api/reports/month?${qs}`} className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-on-primary"><Download className="size-4" aria-hidden /> Download CSV</a>
          </form>
          <p className="mb-2 text-sm text-muted">{me.role === "hr" ? "Everyone" : "Your team"} · {formatMonth(`${month}-01`)} · {rows.length} {rows.length === 1 ? "person" : "people"}. Downloads are recorded.</p>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="bg-bg text-xs uppercase tracking-wide text-muted"><tr>
                {["Code", "Name", "Location", "Days", "Present", "WFH", "CL", "SL", "EL", "ML", "PL", "LOP", "Holidays", "Weekly off", "Late"].map((h) => <th key={h} className="px-3 py-3">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-border">
                {rows.length === 0 && <tr><td colSpan={15} className="px-3 py-8 text-center text-muted">No employees for this month.</td></tr>}
                {rows.map((r) => (
                  <tr key={r.id}><td className="px-3 py-2 font-medium">{r.code}</td><td className="px-3 py-2">{r.name}</td><td className="px-3 py-2 text-muted">{r.location}</td>
                    {[r.daysEmployed, r.present, r.wfh, r.cl, r.sl, r.el, r.ml, r.pl, r.lop, r.holidays, r.weeklyOffs, r.lateMarks].map((v, i) => <td key={i} className="px-3 py-2">{f1(v)}</td>)}</tr>))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </AppShell>
  );
}
