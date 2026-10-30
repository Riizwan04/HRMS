import { describe, expect, it, vi } from "vitest";
import { as } from "@/test/int-helpers";
import { decideRequest } from "@/modules/approvals";
import { addHoliday, cancelOptional, getHolidays, getMySiteId, getOptionalChoices, requestOptional } from "./index";

vi.mock("@/lib/auth", async () => (await import("@/test/int-helpers")).authMock());

vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-10-16T12:00:00+05:30"));

const find = async (name: string) => (await getHolidays(2026)).holidays.find((h) => h.name === name)!;

describe("A7 holiday calendar", () => {
  it("lists both sites with their weekly-off wording and each holiday's type", async () => {
    as("emp1");
    const { sites, holidays } = await getHolidays(2026);
    expect(sites.map((s) => s.name).sort()).toEqual(["Panaji Head Office", "Verna Plant"]);
    expect(sites.find((s) => s.name.startsWith("Panaji"))!.week).toBe("5-day week, Saturday and Sunday off");
    expect(sites.find((s) => s.name.startsWith("Verna"))!.week).toBe("6-day week, Sunday off");
    expect(holidays.find((h) => h.name === "Verna Fest")).toMatchObject({ type: "state", date: "2026-11-09" });
  });
  it("my site is my own location", async () => {
    as("emp1");
    const { sites } = await getHolidays(2026);
    const mine = await getMySiteId();
    expect(sites.find((s) => s.id === mine)!.name).toBe("Panaji Head Office");
  });
  it("only HR can add a holiday; HR adds it for chosen sites", async () => {
    as("emp1");
    const { sites } = await getHolidays(2026);
    const ho = sites.find((s) => s.name.startsWith("Panaji"))!.id;
    expect(await addHoliday({ siteIds: [ho], date: "2026-11-30", name: "Test Day", type: "state" })).toEqual({ ok: false, error: "Only HR can change the holiday calendar" });
    as("hr");
    expect(await addHoliday({ siteIds: [ho], date: "2026-11-30", name: "Test Day", type: "state" })).toEqual({ ok: true });
    expect(await find("Test Day")).toMatchObject({ date: "2026-11-30", type: "state" });
  });
});

describe("Optional holidays (LR-17): two a year, approved by the manager", () => {
  it("choose one: pending; manager approves; it counts against the quota of 2", async () => {
    as("emp2");
    const one = await find("Optional One");
    const r = await requestOptional({ holidayId: one.id });
    expect(r.ok).toBe(true);
    expect((await getOptionalChoices(2026))[one.id]).toBe("pending");
    as("mgr");
    expect(await decideRequest({ kind: "optional_holiday", id: (r as { ok: true; id: string }).id, decision: "approve", comment: "" })).toEqual({ ok: true });
    as("emp2");
    expect((await getOptionalChoices(2026))[one.id]).toBe("approved");
  });
  it("a third optional holiday is refused", async () => {
    as("emp2");
    expect((await requestOptional({ holidayId: (await find("Optional Two")).id })).ok).toBe(true);
    expect(await requestOptional({ holidayId: (await find("Optional Three")).id })).toEqual({ ok: false, error: "You have already chosen your 2 optional holidays for the year" });
  });
  it("a pending choice can be cancelled, which frees the quota", async () => {
    as("emp2");
    const two = await find("Optional Two");
    const choices = await getOptionalChoices(2026);
    expect(choices[two.id]).toBe("pending");
    expect(await cancelOptional({ holidayId: two.id })).toEqual({ ok: true });
    expect((await requestOptional({ holidayId: (await find("Optional Three")).id })).ok).toBe(true);
  });
});
