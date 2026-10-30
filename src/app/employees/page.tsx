import { Plus, Search, Users } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { inputCls } from "@/components/ui/field";
import { requireRole } from "@/lib/auth";
import { dateLineFor } from "@/lib/page-context";
import { PREVIEW_ENABLED } from "@/lib/preview-data";
import { getFormOptions, listEmployees } from "@/modules/employees";

export const metadata = { title: "Employees · Kinara" };

export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string; q?: string; status?: string; location?: string; department?: string }> }) {
  const sp = await searchParams;
  const me = await requireRole("hr", sp.role ?? "hr");
  const status = sp.status === "inactive" || sp.status === "all" ? sp.status : "active";
  const [rows, opts] = me.demo ? [[], null] : await Promise.all([listEmployees({ q: sp.q, status, locationId: sp.location, departmentId: sp.department }), getFormOptions()]);
  return (
    <AppShell demo={me.demo} liveData={!me.demo} role={me.role} active="employees" enabled={PREVIEW_ENABLED} userName={me.name} dateLine={dateLineFor(me.demo)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Employees</h1>
        {!me.demo && <LinkButton href="/employees/new"><Plus className="size-4" aria-hidden /> Add employee</LinkButton>}
      </div>
      {me.demo || !opts ? (
        <Card><CardBody className="py-10 text-center text-sm text-muted">The employee directory needs the live database. Sign in as an HR Admin to use it.</CardBody></Card>
      ) : (
        <>
          <form method="get" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
            <label className="sr-only" htmlFor="q">Search by name, code or email</label>
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted" aria-hidden />
              <input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Search name, code or email" className={`${inputCls} pl-9`} /></div>
            <label className="sr-only" htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={status} className={inputCls}><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option></select>
            <label className="sr-only" htmlFor="location">Location</label>
            <select id="location" name="location" defaultValue={sp.location ?? ""} className={inputCls}><option value="">All locations</option>{opts.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
            <label className="sr-only" htmlFor="department">Department</label>
            <select id="department" name="department" defaultValue={sp.department ?? ""} className={inputCls}><option value="">All departments</option>{opts.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
            <button className="h-11 rounded-lg bg-primary px-4 text-base font-semibold text-on-primary" type="submit">Search</button>
          </form>

          {rows.length === 0 ? (
            <Card><CardBody className="flex flex-col items-center gap-2 py-10 text-center"><Users className="size-8 text-muted" aria-hidden /><p className="font-medium">No employees match.</p><p className="text-sm text-muted">Try a different search or filter.</p></CardBody></Card>
          ) : (
            <>
              <p className="mb-2 text-sm text-muted">{rows.length} employee{rows.length === 1 ? "" : "s"}</p>
              <Card className="hidden overflow-hidden md:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-bg text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-3">Code</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Designation</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Reports to</th><th className="px-4 py-3">Status</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((r) => (
                      <tr key={r.id} className="hover:bg-surface-2">
                        <td className="px-4 py-3 font-medium">{r.code}</td>
                        <td className="px-4 py-3"><Link href={`/employees/${r.id}`} className="font-medium text-primary underline">{r.name}</Link><br /><span className="text-xs text-muted">{r.email}</span></td>
                        <td className="px-4 py-3">{r.designation}</td><td className="px-4 py-3">{r.department}</td><td className="px-4 py-3">{r.location}</td>
                        <td className="px-4 py-3 text-muted">{r.manager ?? "-"}</td>
                        <td className="px-4 py-3"><span className={r.status === "active" ? "rounded-full bg-st-present-bg px-2.5 py-1 text-xs font-semibold text-st-present" : "rounded-full bg-st-off-bg px-2.5 py-1 text-xs font-semibold text-st-off"}>{r.status === "active" ? "Active" : "Inactive"}</span></td>
                      </tr>))}
                  </tbody>
                </table>
              </Card>
              <ul className="flex flex-col gap-3 md:hidden">
                {rows.map((r) => (
                  <li key={r.id}><Link href={`/employees/${r.id}`}><Card className="p-4">
                    <p className="font-semibold">{r.name} <span className="font-normal text-muted">· {r.code}</span></p>
                    <p className="text-sm">{r.designation} · {r.department}</p><p className="text-sm text-muted">{r.location}{r.status !== "active" ? " · Inactive" : ""}</p>
                  </Card></Link></li>))}
              </ul>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
