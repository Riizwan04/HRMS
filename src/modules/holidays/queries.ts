import "server-only";
import { requireEmployee } from "@/lib/auth";
import { q, withUser } from "@/lib/db/client";
import type { HolidayRow, HolidayType } from "@/lib/preview-data";
import { todayIST } from "@/lib/time/ist";

// Reads for the holiday calendar. Reference data is readable by every signed-in employee (RLS), so plain selects are fine here.
const DAY = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export type Site = { id: string; name: string; week: string };

/** "5-day week, Saturday and Sunday off" from the stored weekly-off days (presentation of data, not a rule). */
export function weekWording(offDays: number[]): string {
  const names = [...offDays].sort().map((d) => DAY[d]);
  return `${7 - offDays.length}-day week, ${names.join(" and ")} off`;
}

export async function getMySiteId(): Promise<string> {
  const me = await requireEmployee();
  return me.locationId;
}

export async function getHolidays(year: number): Promise<{ sites: Site[]; holidays: HolidayRow[] }> {
  const me = await requireEmployee();
  const [sites, rows] = await withUser({ sub: me.sub }, [
    q`select l.id, l.name, (select w.weekly_off_days from public.location_weekly_offs w where w.location_id = l.id and w.effective_from <= ${todayIST()}::date
                              order by w.effective_from desc limit 1) as offs
        from public.locations l where l.is_active order by l.name`,
    q`select h.id, h.location_id, h.holiday_date::text as d, h.name, h.type::text as type,
             exists (select 1 from public.location_weekly_offs w where w.location_id = h.location_id
                      and w.effective_from = (select max(x.effective_from) from public.location_weekly_offs x where x.location_id = h.location_id and x.effective_from <= h.holiday_date)
                      and extract(isodow from h.holiday_date)::int = any(w.weekly_off_days)) as on_off
        from public.holidays h where extract(year from h.holiday_date)::int = ${year}::int order by h.holiday_date`,
  ]);
  return {
    sites: sites.map((s) => ({ id: String(s.id), name: String(s.name), week: weekWording((s.offs as number[] | null) ?? []) })),
    holidays: rows.map((r) => ({ id: String(r.id), site: String(r.location_id), date: String(r.d), name: String(r.name), type: r.type as HolidayType, onWeeklyOff: Boolean(r.on_off) })),
  };
}

/** holiday id -> "pending" | "approved" for my optional-holiday choices in the year. */
export async function getOptionalChoices(year: number): Promise<Record<string, "pending" | "approved">> {
  const me = await requireEmployee();
  const [rows] = await withUser({ sub: me.sub }, [q`select o.holiday_id, o.status::text as status from public.optional_holiday_requests o
      join public.holidays h on h.id = o.holiday_id
     where o.employee_id = ${me.id}::uuid and o.status in ('pending', 'approved') and extract(year from h.holiday_date)::int = ${year}::int`]);
  return Object.fromEntries(rows.map((r) => [String(r.holiday_id), r.status as "pending" | "approved"]));
}
