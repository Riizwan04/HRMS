import { beforeAll, describe, expect, it, vi } from "vitest";
import { as } from "@/test/int-helpers";
import { applyLeave, cancelLeave, decideLeave, getBalances, getHistory, getLeaveTypes, previewLeave } from "./index";

vi.mock("@/lib/auth", async () => (await import("@/test/int-helpers")).authMock());

// Clock is Fri 16 Oct 2026 12:00 IST. Rules live in the database (db/tests); these prove the app path to them.
let CL: string, SL: string;
beforeAll(async () => {
  as("emp1");
  const types = await getLeaveTypes(2026);
  CL = types.find((t) => t.code === "CL")!.id;
  SL = types.find((t) => t.code === "SL")!.id;
});

describe("L2 leave balance (LR-1, LR-2)", () => {
  it("shows CL 8.0 available for a full-year employee, with the breakdown fields", async () => {
    as("emp1");
    const cl = (await getBalances(2026)).find((b) => b.code === "CL")!;
    expect(cl.available).toBe(8);
    expect(cl).toMatchObject({ opening: expect.any(Number), accrued: 8, used: 0, pending: 0 });
  });
  it("LR-3: a 1 July joiner sees the pro-rated 4.0", async () => {
    as("joiner");
    expect((await getBalances(2026)).find((b) => b.code === "CL")!.available).toBe(4);
  });
});

describe("L3 apply (LR-6, LR-8, LR-9)", () => {
  it("LR-6: Friday to Monday at head office previews 2 working days", async () => {
    as("emp1");
    const plan = await previewLeave({ typeId: CL, from: "2026-10-23", to: "2026-10-26" });
    expect(plan.days).toBe(2);
  });
  it("LR-9: 3 days of sick leave without a certificate cannot be submitted", async () => {
    as("emp2");
    const r = await applyLeave({ typeId: SL, from: "2026-10-27", to: "2026-10-29", reason: "Fever and rest", attachment: null });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r.errors)).toContain("document_required");
  });
  it("LR-8: more CL than available is refused unless the excess is converted to LOP", async () => {
    as("emp2");
    const refused = await applyLeave({ typeId: CL, from: "2026-11-02", to: "2026-11-13", reason: "Long trip home", attachment: null });
    expect(refused.ok).toBe(false);
    expect(JSON.stringify(refused.errors)).toContain("insufficient_balance");
  });
});

describe("L4 approval and L5 cancel (LR-2, LR-15, LR-16, LR-21)", () => {
  let reqId: string;
  it("a submitted request is pending and does not reduce the available balance (LR-2)", async () => {
    as("emp1");
    const r = await applyLeave({ typeId: CL, from: "2026-11-16", to: "2026-11-17", reason: "Family function", attachment: null });
    expect(r.ok).toBe(true);
    reqId = r.id!;
    const cl = (await getBalances(2026)).find((b) => b.code === "CL")!;
    expect(cl.available).toBe(8);
    expect(cl.pending).toBe(2);
    expect((await getHistory(2026)).find((h) => h.id === reqId)!.status).toBe("pending");
  });
  it("LR-15: the employee cannot approve their own leave", async () => {
    as("emp1");
    await expect(decideLeave({ id: reqId, decision: "approve", comment: null })).rejects.toThrow(/forbidden/);
  });
  it("LR-15: a manager of another team cannot decide it", async () => {
    as("mgr2");
    await expect(decideLeave({ id: reqId, decision: "approve", comment: null })).rejects.toThrow(/forbidden/);
  });
  it("LR-2: the direct manager approves; the balance drops only now", async () => {
    as("mgr");
    expect((await decideLeave({ id: reqId, decision: "approve", comment: "Enjoy" })).ok).toBe(true);
    as("emp1");
    const cl = (await getBalances(2026)).find((b) => b.code === "CL")!;
    expect(cl).toMatchObject({ available: 6, used: 2, pending: 0 });
    const row = (await getHistory(2026)).find((h) => h.id === reqId)!;
    expect(row).toMatchObject({ status: "approved", decidedBy: "Mohan Manager", comment: "Enjoy" });
  });
  it("LR-16: cancelling approved leave that has not started restores the balance", async () => {
    as("emp1");
    await cancelLeave({ id: reqId });
    expect((await getBalances(2026)).find((b) => b.code === "CL")!.available).toBe(8);
  });
  it("LR-21: HR can reject any request, and a reject needs a comment", async () => {
    as("emp2");
    const r = await applyLeave({ typeId: CL, from: "2026-12-14", to: "2026-12-14", reason: "Personal work", attachment: null });
    as("hr");
    await expect(decideLeave({ id: r.id!, decision: "reject", comment: "" })).rejects.toThrow(/comment_required/);
    expect((await decideLeave({ id: r.id!, decision: "reject", comment: "Busy day" })).ok).toBe(true);
  });
});
