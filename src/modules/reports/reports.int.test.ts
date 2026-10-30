import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { adminRows } from "@/test/admin";
import { as } from "@/test/int-helpers";
import { exportMonthCsv, getMonthReport } from "./index";

vi.mock("@/lib/auth", async () => (await import("@/test/int-helpers")).authMock());
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-10-16T12:00:00+05:30"));

describe("L8 month-end summary (LR-18) and CSV download (LR-22 masking)", () => {
  it("HR gets every employee; each row reconciles to the days employed", async () => {
    as("hr");
    const rows = await getMonthReport("2026-10", {});
    expect(rows.length).toBeGreaterThanOrEqual(6);
    for (const r of rows) {
      const sum = r.present + r.wfh + r.cl + r.sl + r.el + r.ml + r.pl + r.lop + r.holidays + r.weeklyOffs;
      expect(sum, `${r.code} should add up to ${r.daysEmployed}`).toBeLessThanOrEqual(r.daysEmployed + 0.001);
    }
  });
  it("a manager gets only direct reports; an employee is refused", async () => {
    as("mgr");
    expect((await getMonthReport("2026-10", {})).map((r) => r.name).sort()).toEqual(["Asha Naik", "Joy Joiner", "Ravi Kamat"]);
    as("emp1");
    await expect(getMonthReport("2026-10", {})).rejects.toThrow(/forbidden/);
  });
  it("the CSV has the brief's columns, one line per employee, and no PAN, Aadhaar or bank data", async () => {
    as("hr");
    const { csv, filename, rows } = await exportMonthCsv("2026-10", {});
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("Employee code,Name,Location,Days employed,Days present,WFH days,CL,SL,EL,Maternity,Paternity,LOP days,Holidays,Weekly offs,Late marks");
    expect(lines).toHaveLength(rows + 1);
    expect(filename).toBe("samudra-attendance-2026-10.csv");
    expect(csv).not.toMatch(/ABCDE|XXXX|HDFC|\d{12}/);
  });
  it("each download is logged with a hash of its content", async () => {
    as("mgr");
    const { csv } = await exportMonthCsv("2026-10", {});
    const rows = await adminRows("select scope, row_count, content_hash from public.month_exports order by exported_at desc limit 1");
    expect(rows[0]).toMatchObject({ row_count: 3, content_hash: createHash("sha256").update(csv).digest("hex") });
  });
});
