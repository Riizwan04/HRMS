import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { requireEmployee } from "@/lib/auth";
import { dateLineFor } from "@/lib/page-context";
import { todayIST } from "@/lib/time/ist";
import { holidayRequestStart, holidayRows, holidaySites, PREVIEW_ENABLED, sample, type Role } from "@/lib/preview-data";
import { getHolidays, getMySiteId, getOptionalChoices } from "@/modules/holidays";
import { HolidaysView } from "./holidays-view";

export const metadata = { title: "Holidays · Kinara" };

export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string; state?: string }> }) {
  const sp = await searchParams;
  const me = await requireEmployee(sp.role);
  const role: Role = me.role;
  const today = me.demo ? todayIST(new Date(sample.nowIso)) : todayIST();
  const year = Number(today.slice(0, 4));
  const data = me.demo
    ? { sites: holidaySites, rows: holidayRows, mySite: "ho", start: holidayRequestStart }
    : await (async () => {
        const { sites, holidays } = await getHolidays(year);
        return { sites: sites.map((s) => ({ key: s.id, name: s.name, week: s.week })), rows: holidays, mySite: await getMySiteId(), start: await getOptionalChoices(year) };
      })();
  return (
    <AppShell demo={me.demo} liveData={!me.demo} role={role} active="holidays" enabled={PREVIEW_ENABLED} userName={me.name} dateLine={dateLineFor(me.demo)}>
      <h1 className="mb-1 text-2xl font-semibold">Holidays {year}</h1>
      <p className="mb-4 text-sm text-muted">{me.demo ? "Preview with sample dates. " : ""}HR maintains the calendar for each site; optional holidays need your manager&apos;s approval.</p>
      {sp.state === "loading" ? (
        <div aria-busy="true" aria-label="Loading holidays" className="flex flex-col gap-3"><Skeleton className="h-16" />{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : (
        <HolidaysView sites={data.sites} rows={sp.state === "empty" ? [] : data.rows} mySite={data.mySite} start={data.start}
          today={today} isHr={role === "hr"} live={!me.demo} />
      )}
    </AppShell>
  );
}
