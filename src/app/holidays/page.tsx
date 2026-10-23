import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { displayName } from "@/lib/session";
import { formatDateTimeIST, todayIST } from "@/lib/time/ist";
import { holidayRequestStart, holidayRows, holidaySites, PREVIEW_ENABLED, sample, type Role } from "@/lib/preview-data";
import { HolidaysView } from "./holidays-view";

export const metadata = { title: "Holidays · Kinara" };

export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string; state?: string }> }) {
  const sp = await searchParams;
  const name = await displayName();
  const role: Role = sp.role === "manager" || sp.role === "hr" ? sp.role : "employee";
  return (
    <AppShell role={role} active="holidays" enabled={PREVIEW_ENABLED} userName={name} dateLine={formatDateTimeIST(sample.nowIso)}>
      <h1 className="mb-1 text-2xl font-semibold">Holidays 2026</h1>
      <p className="mb-4 text-sm text-muted">Preview with sample dates. HR imports the real list from the official Goa notification.</p>
      {sp.state === "loading" ? (
        <div aria-busy="true" aria-label="Loading holidays" className="flex flex-col gap-3"><Skeleton className="h-16" />{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : (
        <HolidaysView sites={holidaySites} rows={sp.state === "empty" ? [] : holidayRows} mySite="ho" start={holidayRequestStart}
          today={todayIST(new Date(sample.nowIso))} isHr={role === "hr"} />
      )}
    </AppShell>
  );
}
