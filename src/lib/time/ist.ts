// The only module allowed to touch clocks and time zones (CLAUDE.md rule 1, ARCHITECTURE.md section 8).
// Calendar dates travel as "YYYY-MM-DD" strings and are manipulated with UTC arithmetic, never JS local time.
// IST has no daylight saving, so the fixed offset +05:30 is exact.

export const IST = "Asia/Kolkata";
const OFFSET = "+05:30";

/** A calendar date, "YYYY-MM-DD". Not a Date object. */
export type DateStr = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The one place the system clock is read. Pass `now` in tests. */
export function nowIST(): Date {
  return new Date();
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function istParts(instant: Date | string | number): Parts {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const get = Object.fromEntries(f.formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
  return {
    year: Number(get.year), month: Number(get.month), day: Number(get.day),
    hour: Number(get.hour), minute: Number(get.minute), second: Number(get.second),
  };
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** The IST calendar date of an instant. */
export function toISTDate(instant: Date | string | number): DateStr {
  const p = istParts(instant);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** Today's date in IST. */
export function todayIST(now: Date = nowIST()): DateStr {
  return toISTDate(now);
}

/** Time of day in IST as "HH:mm:ss". */
export function istTimeOfDay(instant: Date | string | number): string {
  const p = istParts(instant);
  return `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

/** An exact instant (ISO string) for a wall-clock time in IST. */
export function istInstant(date: DateStr, time: string): string {
  if (!DATE_RE.test(date)) throw new Error(`Invalid date: ${date}`);
  const t = /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time;
  if (!/^\d{2}:\d{2}:\d{2}$/.test(t)) throw new Error(`Invalid time: ${time}`);
  return new Date(`${date}T${t}${OFFSET}`).toISOString();
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function utcOf(date: DateStr): Date {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (toUTCDate(d) !== date) throw new Error(`Invalid date: ${date}`);
  return d;
}

function toUTCDate(d: Date): DateStr {
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function isValidDate(date: string): boolean {
  try { utcOf(date); return true; } catch { return false; }
}

export function addDays(date: DateStr, n: number): DateStr {
  const d = utcOf(date);
  d.setUTCDate(d.getUTCDate() + n);
  return toUTCDate(d);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: DateStr, b: DateStr): number {
  return Math.round((utcOf(b).getTime() - utcOf(a).getTime()) / 86_400_000);
}

/** ISO weekday: 1 = Monday ... 7 = Sunday (matches the database's weekly_off_days). */
export function isoWeekday(date: DateStr): number {
  const d = utcOf(date).getUTCDay();
  return d === 0 ? 7 : d;
}

export function weekdayShort(date: DateStr): string {
  return WEEKDAYS[utcOf(date).getUTCDay()];
}

export function monthStart(date: DateStr): DateStr {
  return `${date.slice(0, 7)}-01`;
}

export function monthEnd(date: DateStr): DateStr {
  const d = utcOf(monthStart(date));
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return toUTCDate(d);
}

export function addMonths(date: DateStr, n: number): DateStr {
  const d = utcOf(monthStart(date));
  d.setUTCMonth(d.getUTCMonth() + n);
  return toUTCDate(d);
}

/** Every date of the month containing `date`. */
export function daysOfMonth(date: DateStr): DateStr[] {
  const out: DateStr[] = [];
  for (let d = monthStart(date); d <= monthEnd(date); d = addDays(d, 1)) out.push(d);
  return out;
}

/** "16 Oct 2026" */
export function formatDate(date: DateStr): DateStr {
  const d = utcOf(date);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "Fri 16 Oct" */
export function formatDayShort(date: DateStr): string {
  const d = utcOf(date);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "October 2026" */
export function formatMonth(date: DateStr): string {
  const d = utcOf(date);
  const long = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(d);
  return `${long} ${d.getUTCFullYear()}`;
}

/** "10:22 am" in IST */
export function formatTimeIST(instant: Date | string | number): string {
  const p = istParts(instant);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h12}:${pad(p.minute)} ${p.hour < 12 ? "am" : "pm"}`;
}

/** "Fri 16 Oct 2026, 10:22 am IST" */
export function formatDateTimeIST(instant: Date | string | number): string {
  const date = toISTDate(instant);
  return `${formatDayShort(date)} ${date.slice(0, 4)}, ${formatTimeIST(instant)} IST`;
}
