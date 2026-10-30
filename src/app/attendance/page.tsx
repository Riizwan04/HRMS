import { AppShell } from "@/components/app-shell";
import { requireEmployee } from "@/lib/auth";
import { formatDateTimeIST, todayIST } from "@/lib/time/ist";
import { attendanceMonth, attendanceSummary, PREVIEW_ENABLED, sample, sampleRequests, type Role } from "@/lib/preview-data";
import { AttendanceView } from "./attendance-view";

export const metadata = { title: "My attendance · Kinara" };

export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const sp = await searchParams;
  const me = await requireEmployee(sp.role);
  const name = me.name;
  const role: Role = me.role;
  return (
    <AppShell demo={me.demo} role={role} active="attendance" enabled={PREVIEW_ENABLED} userName={name} dateLine={formatDateTimeIST(sample.nowIso)}>
      <h1 className="mb-1 text-2xl font-semibold">My attendance</h1>
      <p className="mb-4 text-sm text-muted">Preview with sample data. Tap a day to see its details or ask for a correction.</p>
      <AttendanceView rows={attendanceMonth} summary={attendanceSummary} requests={sampleRequests} today={todayIST(new Date(sample.nowIso))} windowDays={30} />
    </AppShell>
  );
}
