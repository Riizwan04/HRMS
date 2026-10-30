import { describe, expect, it, vi } from "vitest";
import { as } from "@/test/int-helpers";
import { getSettings, saveDepartment, saveLeaveRule, saveLocation, setWeeklyOffs } from "./index";

vi.mock("@/lib/auth", async () => (await import("@/test/int-helpers")).authMock());
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-10-16T12:00:00+05:30"));

describe("L1 / A7 settings: leave types, departments and locations (HR only)", () => {
  it("HR reads the configuration: leave types with their current rule, locations with weekly offs", async () => {
    as("hr");
    const s = await getSettings();
    const cl = s.leaveTypes.find((t) => t.code === "CL")!;
    expect(cl).toMatchObject({ annualQuota: 8, accrual: "upfront_prorated", halfDay: true });
    const panaji = s.locations.find((l) => l.name.startsWith("Panaji"))!;
    expect(panaji.weeklyOffs).toEqual([6, 7]);
  });
  it("an employee is refused every change", async () => {
    as("emp1");
    expect(await saveDepartment({ name: "Stores" })).toEqual({ ok: false, error: "Only HR can change the settings" });
    expect(await saveLocation({ name: "X", city: "Y", state: "GA" })).toEqual({ ok: false, error: "Only HR can change the settings" });
  });
  it("HR adds a department, and a duplicate name is refused in plain words", async () => {
    as("hr");
    expect(await saveDepartment({ name: "Stores" })).toEqual({ ok: true });
    expect((await getSettings()).departments.map((d) => d.name)).toContain("Stores");
    expect(await saveDepartment({ name: "Stores" })).toEqual({ ok: false, error: "That name is already in use" });
  });
  it("a department with active employees cannot be deactivated", async () => {
    as("hr");
    const ops = (await getSettings()).departments.find((d) => d.name === "Operations")!;
    expect(await saveDepartment({ id: ops.id, name: "Operations", active: false })).toEqual({ ok: false, error: "Move the active employees to another department first" });
  });
  it("HR adds a location and sets its weekly offs (Sunday only: a 6-day week)", async () => {
    as("hr");
    expect(await saveLocation({ name: "Margao Depot", city: "Margao", state: "GA" })).toEqual({ ok: true });
    const depot = (await getSettings()).locations.find((l) => l.name === "Margao Depot")!;
    expect(await setWeeklyOffs({ locationId: depot.id, days: [7], effective: "2026-11-01" })).toEqual({ ok: true });
    expect((await getSettings("2026-11-15")).locations.find((l) => l.name === "Margao Depot")!.weeklyOffs).toEqual([7]);
    expect((await getSettings("2026-10-16")).locations.find((l) => l.name === "Margao Depot")!.weeklyOffs).toEqual([]);   // not yet in force
    expect(await setWeeklyOffs({ locationId: depot.id, days: [], effective: "2026-11-01" })).toEqual({ ok: false, error: "Choose at least one weekly off day" });
  });
  it("HR changes next year's leave rule; this year's balances are untouched", async () => {
    as("hr");
    const cl = (await getSettings()).leaveTypes.find((t) => t.code === "CL")!;
    expect(await saveLeaveRule({ typeId: cl.id, year: 2027, annualQuota: 10, accrual: "upfront_prorated", accrualPerMonth: null, carryForwardMax: 0, halfDay: true, docOverDays: null, maxPerRequest: null, minServiceDays: null })).toEqual({ ok: true });
    expect((await getSettings()).leaveTypes.find((t) => t.code === "CL")!.annualQuota).toBe(8);    // 2026 rule still in force
  });
  it("a rule for a past year cannot be edited", async () => {
    as("hr");
    const cl = (await getSettings()).leaveTypes.find((t) => t.code === "CL")!;
    expect(await saveLeaveRule({ typeId: cl.id, year: 2025, annualQuota: 9, accrual: "upfront_prorated", accrualPerMonth: null, carryForwardMax: 0, halfDay: true, docOverDays: null, maxPerRequest: null, minServiceDays: null }))
      .toEqual({ ok: false, error: "Rules for past years can't be changed" });
  });
});
