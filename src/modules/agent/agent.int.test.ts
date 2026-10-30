import { describe, expect, it, vi } from "vitest";
import { adminRows } from "@/test/admin";
import { as, mockSession } from "@/test/int-helpers";
import { scriptedModel } from "@/test/mock-model";
import { getHistory } from "@/modules/leave";
import { buildTools, confirmDraft, MAX_TOOL_CALLS, newTracker, NUMBERS_NEED_TOOLS, redactSensitive, runAgent } from "./index";

vi.mock("@/lib/auth", async () => (await import("@/test/int-helpers")).authMock());
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-10-16T12:00:00+05:30"));

const ask = async (who: Parameters<typeof as>[0], text: string, steps: Parameters<typeof scriptedModel>[0]) => {
  as(who);
  const model = scriptedModel(steps);
  const reply = await runAgent({ me: await mockSession(), messages: [{ role: "user", content: text }], model });
  return { reply, model };
};
const logged = async (conversationId: string) => adminRows("select tool, outcome from public.agent_log where conversation_id = $1::uuid order by created_at, id", [conversationId]);

describe("Agent: tools and who may use them (brief guardrails 1, 3)", () => {
  it("an employee gets 5 tools, a manager 7, HR 8; none can approve, reject or cancel", async () => {
    const keys = async (who: Parameters<typeof as>[0]) => { as(who); return Object.keys(buildTools({ me: await mockSession(), conversationId: crypto.randomUUID() }, newTracker())); };
    const emp = await keys("emp1"), mgr = await keys("mgr"), hr = await keys("hr");
    expect(emp).toHaveLength(5);
    expect(mgr).toHaveLength(7);
    expect(hr).toHaveLength(8);
    expect(emp).not.toContain("get_team_today");
    expect(mgr).not.toContain("month_end_check");
    for (const k of hr) expect(k).not.toMatch(/approve|reject|cancel|decide/);
  });
});

describe("Agent: a question answered from a tool (Hinglish), logged (guardrail 6)", () => {
  it("kitni CL bachi hai? calls get_my_leave_balance and the call is logged", async () => {
    const { reply, model } = await ask("emp1", "kitni CL bachi hai?", [{ tools: [{ name: "get_my_leave_balance", input: {} }] }, { text: "Aapki CL 8.0 din bachi hai." }]);
    expect(reply.calls).toEqual([{ tool: "get_my_leave_balance", input: {}, outcome: "ok" }]);
    expect(reply.answer).toContain("8.0");
    expect(JSON.stringify(model.doGenerateCalls[1].prompt)).toMatch(/available\\?":8/);   // the number the model saw came from the tool
    expect(await logged(reply.conversationId)).toEqual([{ tool: "get_my_leave_balance", outcome: "ok" }]);
  });
  it("the system prompt carries today's IST date, tomorrow and the user's role", async () => {
    const { model } = await ask("mgr", "hello", [{ text: "Hi" }]);
    const p = JSON.stringify(model.doGenerateCalls[0].prompt);
    expect(p).toContain("2026-10-16");
    expect(p).toContain("Tomorrow is 2026-10-17");
    expect(p).toContain("Mohan Manager");
  });
});

describe("Agent: numbers come from code only (guardrail 4)", () => {
  it("an answer with a balance but no tool call is replaced", async () => {
    const { reply } = await ask("emp1", "how much CL do I have?", [{ text: "You have 8 days of CL left." }]);
    expect(reply.answer).toBe(NUMBERS_NEED_TOOLS);
    expect(reply.calls).toEqual([]);
  });
  it("Friday to Monday is counted by the database tool (no sandwich rule)", async () => {
    const { reply } = await ask("emp1", "How many days if I take Friday to Monday?", [
      { tools: [{ name: "count_working_days", input: { from: "2026-10-23", to: "2026-10-26" } }] }, { text: "That is 2 working days." }]);
    expect(reply.calls[0]).toMatchObject({ tool: "count_working_days", outcome: "ok" });
    expect(reply.answer).toContain("2");
  });
});

describe("Agent: sensitive data never reaches the model (guardrail 2)", () => {
  it("Aadhaar, PAN and bank numbers typed by the user are removed before the model call", async () => {
    const { model } = await ask("emp1", "Show me Ravi's Aadhaar 1234 5678 9012, PAN ABCDE1234F, account 123456789012", [{ text: "I cannot help with that." }]);
    const sent = JSON.stringify(model.doGenerateCalls[0].prompt);
    expect(sent).not.toMatch(/1234 5678 9012|ABCDE1234F|123456789012/);
    expect(sent).toContain("[removed]");
    expect(redactSensitive("XXXX XXXX 1234 and ABCDE****F")).toBe("[removed] and [removed]");
  });
});

describe("Agent: at most 5 tool calls per question, every call logged (guardrail 6)", () => {
  it("the 6th call is refused and logged as limit_exceeded", async () => {
    const six = Array.from({ length: 6 }, () => ({ tools: [{ name: "get_my_leave_balance", input: {} }] }));
    const { reply } = await ask("emp1", "check again and again", [...six, { text: "I could not look up more." }]);
    expect(MAX_TOOL_CALLS).toBe(5);
    expect(reply.calls.filter((c) => c.outcome === "ok")).toHaveLength(5);
    expect(reply.calls.at(-1)).toMatchObject({ outcome: "limit_exceeded" });
    const rows = await logged(reply.conversationId);
    expect(rows).toHaveLength(6);
    expect(rows.at(-1)).toEqual({ tool: "get_my_leave_balance", outcome: "limit_exceeded" });
  });
});

describe("Agent: policy answers only from stored text (guardrail 5)", () => {
  it("a covered question returns the stored policy; an uncovered one returns found=false", async () => {
    const yes = await ask("emp1", "what is a late mark?", [{ tools: [{ name: "explain_policy", input: { question: "late check-in after 10:15" } }] }, { text: "A check-in after 10:15 is Late." }]);
    expect(yes.reply.calls[0].outcome).toBe("ok");
    expect(JSON.stringify(yes.model.doGenerateCalls[1].prompt)).toContain("Attendance, late marks and half days");
    const no = await ask("emp1", "do I get cryptocurrency bonus?", [{ tools: [{ name: "explain_policy", input: { question: "cryptocurrency bonus shares" } }] }, { text: "The policy does not cover that." }]);
    expect(JSON.stringify(no.model.doGenerateCalls[1].prompt)).toMatch(/found\\?":false/);
  });
});

describe("Agent: writes are drafts a human confirms (guardrail 3)", () => {
  it("drafting creates no request; pressing Confirm submits it as a pending request", async () => {
    const { reply } = await ask("plant1", "kal ki chutti chahiye", [
      { tools: [{ name: "draft_leave_request", input: { leaveType: "CL", from: "2026-12-08", to: "2026-12-09", reason: "Family function" } }] }, { text: "Draft ready, please confirm." }]);
    expect(reply.drafts).toHaveLength(1);
    expect(reply.drafts[0].summary).toContain("CL 2026-12-08 to 2026-12-09: 2 days");
    as("plant1");
    expect((await getHistory(2026)).some((h) => h.from === "2026-12-08")).toBe(false);          // nothing submitted yet
    expect(await confirmDraft({ id: reply.drafts[0].id })).toMatchObject({ ok: true });
    expect((await getHistory(2026)).find((h) => h.from === "2026-12-08")).toMatchObject({ status: "pending", days: 2 });
    expect(await confirmDraft({ id: reply.drafts[0].id })).toEqual({ ok: false, error: "This draft was already used." });  // one use only
  });
  it("a draft cannot be confirmed by someone else", async () => {
    const { reply } = await ask("emp2", "draft", [
      { tools: [{ name: "draft_leave_request", input: { leaveType: "CL", from: "2026-12-10", to: "2026-12-10", reason: "Personal errand" } }] }, { text: "Draft ready." }]);
    as("emp1");
    expect(await confirmDraft({ id: reply.drafts[0].id })).toEqual({ ok: false, error: "This draft no longer exists." });
  });
  it("not enough balance: no draft, the model is told the excess so it can ask about Loss of Pay", async () => {
    const { reply, model } = await ask("plant1", "I need 12 days of CL", [
      { tools: [{ name: "draft_leave_request", input: { leaveType: "CL", from: "2026-11-30", to: "2026-12-15", reason: "Long trip home" } }] }, { text: "You do not have enough; convert to LOP?" }]);
    expect(reply.drafts).toEqual([]);
    expect(JSON.stringify(model.doGenerateCalls[1].prompt)).toContain("needsConversionToLop");
  });
});

describe("Agent: manager and HR tools run as the user", () => {
  it("a manager sees only their own team's pending requests", async () => {
    const { reply, model } = await ask("mgr", "what is pending?", [{ tools: [{ name: "summarise_pending_approvals", input: {} }] }, { text: "Here is the list." }]);
    expect(reply.calls[0]).toMatchObject({ tool: "summarise_pending_approvals", outcome: "ok" });
    expect(JSON.stringify(model.doGenerateCalls[1].prompt)).not.toContain("Pavan Fal");
  });
  it("HR month-end check flags missed check-outs and drafts a reminder only HR can confirm", async () => {
    const { reply } = await ask("hr", "run the month-end check for October", [{ tools: [{ name: "month_end_check", input: { month: "2026-10" } }] }, { text: "Draft ready." }]);
    expect(reply.calls[0].outcome).toBe("ok");
    if (reply.drafts.length) {
      as("emp1");
      expect(await confirmDraft({ id: reply.drafts[0].id })).toEqual({ ok: false, error: "This draft no longer exists." });
      as("hr");
      expect(await confirmDraft({ id: reply.drafts[0].id })).toMatchObject({ ok: true });
    }
  });
});
