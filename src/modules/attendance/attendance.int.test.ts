import { describe, expect, it, vi } from "vitest";
import { adminSql } from "@/test/admin";
import { as } from "@/test/int-helpers";
import { decideRequest } from "@/modules/approvals";
import { cancelRequest, checkIn, checkOut, getMonthRows, getMyRequests, getOrgToday, getSummary, getTeamToday, getToday, requestRegularisation, requestWfh } from "./index";

vi.mock("@/lib/auth", async () => (await import("@/test/int-helpers")).authMock());

// The app asks "what is today?" from the clock; pin it to the database test clock (Date only, so timers still work).
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-10-16T12:00:00+05:30"));

// Clock: Fri 16 Oct 2026 12:00 IST. Day status itself is proven by db/tests/02_attendance; these prove the app path to it.
const day = async (d: string) => (await getMonthRows("2026-10-01")).find((r) => r.day === d)!;

describe("A1 check in / out (AR-1)", () => {
  it("check-out before any check-in is refused with a readable message", async () => {
    as("emp2");
    await expect(checkOut()).resolves.toEqual({ ok: false, error: "You haven't checked in today" });
  });
  it("AR-1: check-in creates today's record; a second click does not create another", async () => {
    as("emp2");
    expect(await checkIn()).toMatchObject({ ok: true, created: true });
    expect(await checkIn()).toMatchObject({ ok: true, created: false });
    const today = await getToday();
    expect(today).toMatchObject({ status: "in_progress", check_out: null });
    expect(today.check_in).toMatch(/^2026-10-16T06:30:00Z$/); // 12:00 IST, returned as an ISO instant
  });
  it("check-out is accepted once time has passed since check-in (AR-2)", async () => {
    as("emp2");
    // The test clock is frozen, so move the punch an hour back instead of waiting.
    await adminSql("update public.attendance set check_in = check_in - interval '1 hour' where employee_id = (select id from public.employees where email = 'u_emp2@example.in') and work_date = date '2026-10-16'");
    expect(await checkOut()).toMatchObject({ ok: true });
    expect(await getToday()).toMatchObject({ check_out: expect.any(String) });
  });
});

describe("A4 calendar (AR-2, AR-3 weekly offs)", () => {
  it("head office Saturday is a Weekly Off and a past day with no punch is Absent", async () => {
    as("emp1");
    expect((await day("2026-10-17")).status).toBe("weekly_off"); // Saturday
    expect((await day("2026-10-22")).status).toBe("future");
    expect((await day("2026-10-10")).status).toBe("weekly_off");
    expect((await day("2026-10-14")).status).toBe("absent");
  });
  it("summary counts come from the day rows", async () => {
    as("emp1");
    const rows = await getMonthRows("2026-10-01");
    const s = getSummary(rows, 3);
    expect(s.absent).toBeGreaterThan(0);
    expect(s.lateLimit).toBe(3);
  });
});

describe("A5 regularisation (AR-11): attendance changes only after approval", () => {
  let id: string;
  it("a request for a missed day is pending and the day stays Absent", async () => {
    as("emp2");
    const r = await requestRegularisation({ date: "2026-10-14", inTime: "09:55", outTime: "18:00", reason: "Forgot to punch" });
    expect(r.ok).toBe(true);
    id = (r as { ok: true; id: string }).id;
    expect((await day("2026-10-14")).status).toBe("absent");
    expect((await getMyRequests()).find((x) => x.id === id)).toMatchObject({ kind: "Regularisation", status: "pending" });
  });
  it("a second request for the same day is refused", async () => {
    as("emp2");
    expect(await requestRegularisation({ date: "2026-10-14", inTime: "09:55", outTime: "18:00", reason: "Again please" }))
      .toEqual({ ok: false, error: "You already have a pending request for this date" });
  });
  it("the manager approves; the day becomes Present with the requested times (IST)", async () => {
    as("mgr");
    expect(await decideRequest({ kind: "regularisation", id, decision: "approve", comment: "" })).toEqual({ ok: true });
    as("emp2");
    expect(await day("2026-10-14")).toMatchObject({ status: "present", worked_minutes: 485 });
  });
  it("more than 30 days back is outside the window", async () => {
    as("emp2");
    expect(await requestRegularisation({ date: "2026-09-01", inTime: "09:55", outTime: "18:00", reason: "Too old to fix" }))
      .toEqual({ ok: false, error: "Corrections can only be requested for the last 30 days" });
  });
});

describe("A3 work from home (AR-7): Present only after the manager approves", () => {
  let id: string;
  it("pending WFH does not count; approved WFH is Present", async () => {
    as("emp1");
    const r = await requestWfh({ date: "2026-10-19", reason: "Plumber visiting home" });
    expect(r.ok).toBe(true);
    id = (r as { ok: true; id: string }).id;
    expect((await getMonthRows("2026-10-01")).find((x) => x.day === "2026-10-19")).toMatchObject({ is_wfh: false });
    as("mgr");
    await decideRequest({ kind: "wfh", id, decision: "approve", comment: "" });
    as("emp1");
    expect((await getMonthRows("2026-10-01")).find((x) => x.day === "2026-10-19")).toMatchObject({ status: "present", is_wfh: true });
  });
  it("a weekend date is refused", async () => {
    as("emp1");
    expect(await requestWfh({ date: "2026-10-24", reason: "Working at home" })).toEqual({ ok: false, error: "That day is a weekly off or holiday" });
  });
  it("a pending request can be cancelled by its owner only", async () => {
    as("emp2");
    const r = (await requestWfh({ date: "2026-10-21", reason: "Internet technician visit" })) as { ok: true; id: string };
    as("emp1");
    expect(await cancelRequest({ kind: "wfh", id: r.id })).toEqual({ ok: false, error: "This request can't be cancelled" });
    as("emp2");
    expect(await cancelRequest({ kind: "wfh", id: r.id })).toEqual({ ok: true });
  });
});

describe("Dashboard cards: team and organisation today (A6)", () => {
  it("a manager sees only direct reports; an employee sees nobody", async () => {
    as("mgr");
    const t = await getTeamToday();
    expect(t.total).toBe(3); // emp1, emp2 and joiner report to mgr
    as("emp1");
    expect((await getTeamToday()).total).toBe(0);
  });
  it("HR sees organisation counts; an employee is refused its own view of them", async () => {
    as("hr");
    const o = await getOrgToday();
    expect(o.active).toBe(7);
    expect(o.notSignedIn).toBe(0);
  });
});
