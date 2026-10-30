import { describe, expect, it, vi } from "vitest";
import { as } from "@/test/int-helpers";
import { getTeamLeaveMonth, getTeamMonth } from "./index";

vi.mock("@/lib/auth", async () => (await import("@/test/int-helpers")).authMock());
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-10-16T12:00:00+05:30"));

describe("A6 team attendance: who is present, on leave or absent (managers: direct reports; HR: all)", () => {
  it("a manager gets one row per direct report and one cell per day of the month", async () => {
    as("mgr");
    const m = await getTeamMonth("2026-10-01");
    expect(m.days).toHaveLength(31);
    expect(m.members.map((x) => x.name)).toEqual(["Asha Naik", "Joy Joiner", "Ravi Kamat"]);
    const ravi = m.members.find((x) => x.name === "Ravi Kamat")!;
    expect(m.cells[ravi.id]["2026-10-14"].status).toBe("present");        // regularised earlier (AR-11)
    expect(m.cells[ravi.id]["2026-10-10"].status).toBe("weekly_off");     // Saturday at head office
  });
  it("another team's manager does not see them", async () => {
    as("mgr2");
    expect((await getTeamMonth("2026-10-01")).members.map((x) => x.name)).toEqual(["Pavan Fal"]);
  });
  it("HR sees everyone; an employee sees nobody", async () => {
    as("hr");
    expect((await getTeamMonth("2026-10-01")).members.length).toBeGreaterThanOrEqual(6);
    as("emp1");
    expect((await getTeamMonth("2026-10-01")).members).toEqual([]);
  });
});

describe("L7 leave calendar: team leave on a month view, to spot clashes", () => {
  it("shows approved leave and pending requests, with the leave type", async () => {
    as("mgr");
    const l = await getTeamLeaveMonth("2026-11-01");
    const ravi = l.members.find((x) => x.name === "Ravi Kamat")!;
    expect(l.cells[ravi.id]["2026-11-23"]).toMatchObject({ code: "CL", status: "approved" });
    expect(l.clashes["2026-11-23"]).toEqual(["Ravi Kamat"]);
  });
  it("a plain employee gets an empty calendar", async () => {
    as("emp1");
    expect((await getTeamLeaveMonth("2026-11-01")).members).toEqual([]);
  });
});
