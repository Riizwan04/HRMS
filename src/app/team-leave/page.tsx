import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { TeamGrid } from "@/components/team-grid";
import { Card, CardBody } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { dateLineFor } from "@/lib/page-context";
import { PREVIEW_ENABLED } from "@/lib/preview-data";
import { addMonths, formatDayShort, formatMonth, monthStart, todayIST } from "@/lib/time/ist";
import { getTeamLeaveMonth } from "@/modules/team";

export const metadata = { title: "Leave calendar · Samudra" };

export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string; month?: string }> }) {
  const sp = await searchParams;
  const me = await requireRole("manager", sp.role ?? "manager");
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? "") ? `${sp.month}-01` : monthStart(todayIST());
  const data = me.demo ? null : await getTeamLeaveMonth(month);
  const clashDays = data ? Object.entries(data.clashes).filter(([, n]) => n.length >= 2).sort(([a], [b]) => a.localeCompare(b)) : [];
  return (
    <AppShell demo={me.demo} liveData={!me.demo} role={me.role} active="teamleave" enabled={PREVIEW_ENABLED} userName={me.name} dateLine={dateLineFor(me.demo)}>
      <h1 className="mb-4 text-2xl font-semibold">Leave calendar</h1>
      {!data ? (
        <Card><CardBody className="py-10 text-center text-sm text-muted">The leave calendar needs the live database. Sign in as a manager or HR Admin to use it.</CardBody></Card>
      ) : data.members.length === 0 ? (
        <Card><CardBody className="py-10 text-center text-sm text-muted">No one reports to you yet.</CardBody></Card>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{formatMonth(month)}</h2>
            <div className="flex gap-1">
              <Link href={`/team-leave?month=${addMonths(month, -1).slice(0, 7)}`} aria-label="Previous month" className="inline-flex h-9 items-center rounded-lg border border-input px-2"><ChevronLeft className="size-4" aria-hidden /></Link>
              <Link href={`/team-leave?month=${addMonths(month, 1).slice(0, 7)}`} aria-label="Next month" className="inline-flex h-9 items-center rounded-lg border border-input px-2"><ChevronRight className="size-4" aria-hidden /></Link>
            </div>
          </div>
          {clashDays.length > 0 && (
            <p role="status" className="mb-3 flex items-start gap-2 rounded-lg border border-warning p-3 text-sm text-warning"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              Clashes: {clashDays.map(([d, n]) => `${formatDayShort(d)} (${n.join(", ")})`).join("; ")}</p>)}
          <TeamGrid days={data.days} members={data.members} cell={(id, d) => {
            const c = data.cells[id]?.[d];
            return c ? { cls: "bg-st-leave-bg text-st-leave", text: c.code, label: `${c.code} leave, ${c.status}`, dashed: c.status === "pending" } : { cls: "text-muted", text: "", label: "No leave" };
          }} />
          <p className="mt-3 text-sm text-muted">Solid cells are approved leave; dashed cells are still waiting for a decision. Days with two or more people away are listed above.</p>
        </>
      )}
    </AppShell>
  );
}
