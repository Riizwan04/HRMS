import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { cellStyle } from "@/components/status-badge";
import { TeamGrid } from "@/components/team-grid";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { dateLineFor } from "@/lib/page-context";
import { PREVIEW_ENABLED } from "@/lib/preview-data";
import { addMonths, formatMonth, monthStart, todayIST } from "@/lib/time/ist";
import { getTeamTodayDetail } from "@/modules/attendance";
import { getTeamMonth } from "@/modules/team";

export const metadata = { title: "Team attendance · Samudra" };

export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string; month?: string }> }) {
  const sp = await searchParams;
  const me = await requireRole("manager", sp.role ?? "manager");
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? "") ? `${sp.month}-01` : monthStart(todayIST());
  const [today, grid] = me.demo ? [[], null] : await Promise.all([getTeamTodayDetail(), getTeamMonth(month)]);
  const groups = [
    { title: "Present", f: (p: (typeof today)[number]) => (p.status === "present" || p.status === "in_progress" || p.status === "half_day") && !p.wfh },
    { title: "Working from home", f: (p: (typeof today)[number]) => p.status === "present" && p.wfh },
    { title: "On leave", f: (p: (typeof today)[number]) => p.status === "on_leave" },
    { title: "Not checked in", f: (p: (typeof today)[number]) => p.status === "pending" || p.status === "absent" },
    { title: "Weekly off or holiday", f: (p: (typeof today)[number]) => p.status === "weekly_off" || p.status === "holiday" },
  ];
  return (
    <AppShell demo={me.demo} liveData={!me.demo} role={me.role} active="team" enabled={PREVIEW_ENABLED} userName={me.name} dateLine={dateLineFor(me.demo)}>
      <h1 className="mb-4 text-2xl font-semibold">Team attendance</h1>
      {me.demo || !grid ? (
        <Card><CardBody className="py-10 text-center text-sm text-muted">Team attendance needs the live database. Sign in as a manager or HR Admin to use it.</CardBody></Card>
      ) : grid.members.length === 0 ? (
        <Card><CardBody className="flex flex-col items-center gap-2 py-10 text-center"><Users className="size-8 text-muted" aria-hidden /><p className="font-medium">No one reports to you yet.</p></CardBody></Card>
      ) : (
        <>
          <Card className="mb-4">
            <CardHeader title={`Today (${today.length})`} />
            <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((g) => { const names = today.filter(g.f).map((p) => p.name); return (
                <div key={g.title}><p className="text-sm font-semibold">{g.title} <span className="font-normal text-muted">({names.length})</span></p>
                  <p className="mt-1 text-sm text-muted">{names.length ? names.join(", ") : "-"}</p></div>); })}
            </CardBody>
          </Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{formatMonth(month)}</h2>
            <div className="flex gap-1">
              <Link href={`/team?month=${addMonths(month, -1).slice(0, 7)}`} aria-label="Previous month" className="inline-flex h-9 items-center rounded-lg border border-input px-2"><ChevronLeft className="size-4" aria-hidden /></Link>
              <Link href={`/team?month=${addMonths(month, 1).slice(0, 7)}`} aria-label="Next month" className="inline-flex h-9 items-center rounded-lg border border-input px-2"><ChevronRight className="size-4" aria-hidden /></Link>
            </div>
          </div>
          <TeamGrid days={grid.days} members={grid.members} cell={(id, d) => {
            const c = grid.cells[id]?.[d];
            const st = cellStyle(c?.status ?? "future");
            return { cls: st.cls, text: st.code + (c?.wfh ? "H" : ""), label: `${st.label || "Upcoming"}${c?.late ? ", late" : ""}${c?.wfh ? ", work from home" : ""}` };
          }} />
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Legend">{(["present", "half_day", "absent", "on_leave", "holiday", "weekly_off"] as const).map((s) => <li key={s}><StatusBadge status={s} /></li>)}</ul>
        </>
      )}
    </AppShell>
  );
}
