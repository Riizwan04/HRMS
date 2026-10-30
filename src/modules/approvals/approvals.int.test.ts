import { beforeAll, describe, expect, it, vi } from "vitest";
import { as } from "@/test/int-helpers";
import { applyLeave, getLeaveTypes } from "@/modules/leave";
import { decideRequest, getDecisions, getPendingApprovals } from "./index";

vi.mock("@/lib/auth", async () => (await import("@/test/int-helpers")).authMock());

let CL: string, leaveId: string;
beforeAll(async () => {
  as("emp2");
  CL = (await getLeaveTypes(2026)).find((t) => t.code === "CL")!.id;
  const r = await applyLeave({ typeId: CL, from: "2026-11-23", to: "2026-11-24", reason: "Wedding in the family", attachment: null });
  leaveId = r.id!;
});

describe("Approvals inbox (L4, LR-15, LR-21, LR-17 scope)", () => {
  it("the direct manager sees the request with balance before and after", async () => {
    as("mgr");
    const item = (await getPendingApprovals()).find((i) => i.id === leaveId)!;
    expect(item).toMatchObject({ kind: "leave", name: "Ravi Kamat", type: "CL", days: 2, available: 8, after: 6 });
  });
  it("a plain employee sees nothing", async () => {
    as("emp1");
    expect(await getPendingApprovals()).toEqual([]);
  });
  it("another team's manager does not see it (scope: direct reports only)", async () => {
    as("mgr2");
    expect((await getPendingApprovals()).find((i) => i.id === leaveId)).toBeUndefined();
  });
  it("LR-15: a reject without a comment is refused with a readable message", async () => {
    as("mgr");
    const r = await decideRequest({ kind: "leave", id: leaveId, decision: "reject", comment: "" });
    expect(r).toEqual({ ok: false, error: "Add a short comment so the employee knows why" });
  });
  it("LR-15: the requester cannot decide their own request", async () => {
    as("emp2");
    const r = await decideRequest({ kind: "leave", id: leaveId, decision: "approve", comment: "" });
    expect(r.ok).toBe(false);
  });
  it("LR-21: HR approves and the request leaves the inbox", async () => {
    as("hr");
    expect(await decideRequest({ kind: "leave", id: leaveId, decision: "approve", comment: "" })).toEqual({ ok: true });
    as("mgr");
    expect((await getPendingApprovals()).find((i) => i.id === leaveId)).toBeUndefined();
  });
});

describe("Decided tab", () => {
  it("lists what the caller decided, with the comment and outcome", async () => {
    as("emp1");
    const r = await applyLeave({ typeId: CL, from: "2026-12-21", to: "2026-12-21", reason: "Personal errand", attachment: null });
    as("mgr");
    await decideRequest({ kind: "leave", id: r.id!, decision: "reject", comment: "Year-end rush" });
    const d = (await getDecisions()).find((x) => x.id === r.id)!;
    expect(d).toMatchObject({ outcome: "rejected", comment: "Year-end rush" });
    expect(d.text).toContain("Asha Naik");
  });
  it("does not list other people's decisions", async () => {
    as("mgr2");
    expect(await getDecisions()).toEqual([]);
  });
});
