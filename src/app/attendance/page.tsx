import { AppShell } from "@/components/app-shell";
import { requireEmployee } from "@/lib/auth";
import { dateLineFor } from "@/lib/page-context";
import { addMonths, monthStart, todayIST } from "@/lib/time/ist";
import { attendanceMonth, attendanceSummary, PREVIEW_ENABLED, sample, sampleRequests, type Role } from "@/lib/preview-data";
import { getLateLimit, getMonthRows, getMyRequests, getSummary } from "@/modules/attendance";
import { AttendanceView } from "./attendance-view";

export const metadata = { title: "My attendance · Kinara" };

export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string; month?: string }> }) {
  const sp = await searchParams;
  const me = await requireEmployee(sp.role);
  const role: Role = me.role;
  const today = me.demo ? todayIST(new Date(sample.nowIso)) : todayIST();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? "") ? `${sp.month}-01` : monthStart(today);
  const data = me.demo
    ? { rows: attendanceMonth, summary: attendanceSummary, requests: sampleRequests }
    : await (async () => {
        const rows = await getMonthRows(month);
        return { rows, summary: getSummary(rows, await getLateLimit()), requests: await getMyRequests() };
      })();
  const link = (m: string) => `/attendance?month=${m.slice(0, 7)}`;
  return (
    <AppShell demo={me.demo} liveData={!me.demo} role={role} active="attendance" enabled={PREVIEW_ENABLED} userName={me.name} dateLine={dateLineFor(me.demo)}>
      <h1 className="mb-1 text-2xl font-semibold">My attendance</h1>
      <p className="mb-4 text-sm text-muted">{me.demo ? "Preview with sample data. " : ""}Tap a day to see its details or ask for a correction.</p>
      <AttendanceView rows={data.rows} summary={data.summary} requests={data.requests} today={today} windowDays={30} live={!me.demo}
        prevHref={me.demo ? undefined : link(addMonths(month, -1))} nextHref={me.demo ? undefined : link(addMonths(month, 1))} />
    </AppShell>
  );
}
