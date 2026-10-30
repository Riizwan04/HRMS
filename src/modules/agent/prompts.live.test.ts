import { google } from "@ai-sdk/google";
import { describe, expect, it, vi } from "vitest";
import type { Me, Role } from "@/lib/auth";
import { adminRows } from "@/test/admin";
import prompts from "./prompts.json";
import { runAgent } from "./run";

// Runs prompts.json against the REAL model and database (brief: at least 15 test prompts, run after every change).
//   Needs: DATABASE_URL (app_runtime), DATABASE_URL_ADMIN (to look up the three test people), GOOGLE_GENERATIVE_AI_API_KEY,
//          SEED_HR_EMAIL, SEED_MANAGER_EMAIL, SEED_EMPLOYEE_EMAIL (each must have signed in once so they are linked to Clerk).
//   Run:   npm run agent:prompts              (all)     |     npm run agent:prompts -- -t "#6"     (one prompt)
const current = vi.hoisted(() => ({ me: null as unknown }));
vi.mock("@/lib/auth", () => ({ requireEmployee: async () => current.me, requireRole: async () => current.me }));

type P = { id: number; role: Role; prompt: string; note?: string; toolsMustInclude?: string[]; toolsMustNotInclude?: string[]; draftsMin?: number; draftsMax?: number; answerMustMatch?: string; answerMustNotMatch?: string };
const EMAIL: Record<Role, string | undefined> = { hr: process.env.SEED_HR_EMAIL, manager: process.env.SEED_MANAGER_EMAIL, employee: process.env.SEED_EMPLOYEE_EMAIL };
const cache = new Map<Role, Me>();

async function person(role: Role): Promise<Me> {
  if (cache.has(role)) return cache.get(role)!;
  const email = EMAIL[role]?.toLowerCase();
  if (!email) throw new Error(`Set SEED_${role === "hr" ? "HR" : role === "manager" ? "MANAGER" : "EMPLOYEE"}_EMAIL`);
  const rows = await adminRows(`select e.id, e.full_name, e.clerk_user_id, e.location_id, l.name as location_name,
      (select m.full_name from public.employees m where m.id = e.reporting_manager_id) as manager_name
    from public.employees e join public.locations l on l.id = e.location_id where e.email = $1::citext`, [email]);
  const r = rows[0] as Record<string, string> | undefined;
  if (!r?.clerk_user_id) throw new Error(`${email} has not signed in yet (no linked Clerk user)`);
  const me = { id: r.id, sub: r.clerk_user_id, name: r.full_name, role, locationId: r.location_id, locationName: r.location_name, managerName: r.manager_name, demo: false } as Me;
  cache.set(role, me);
  return me;
}

describe.skipIf(!process.env.GOOGLE_GENERATIVE_AI_API_KEY)("assistant against the real model", () => {
  it.each(prompts as P[])("#$id [$role] $prompt", async (p) => {
    current.me = await person(p.role);
    const reply = await runAgent({ me: current.me as Me, messages: [{ role: "user", content: p.prompt }], model: google(process.env.AGENT_MODEL || "gemini-2.5-flash") });
    const tools = reply.calls.map((c) => c.tool);
    for (const t of p.toolsMustInclude ?? []) expect(tools, `expected tool ${t}; answer: ${reply.answer}`).toContain(t);
    for (const t of p.toolsMustNotInclude ?? []) expect(tools, `must not call ${t}`).not.toContain(t);
    if (p.draftsMin !== undefined) expect(reply.drafts.length, `answer: ${reply.answer}`).toBeGreaterThanOrEqual(p.draftsMin);
    if (p.draftsMax !== undefined) expect(reply.drafts.length).toBeLessThanOrEqual(p.draftsMax);
    if (p.answerMustMatch) expect(reply.answer).toMatch(new RegExp(p.answerMustMatch, "i"));
    if (p.answerMustNotMatch) expect(reply.answer).not.toMatch(new RegExp(p.answerMustNotMatch, "i"));
    await new Promise((r) => setTimeout(r, 4000)); // stay inside the free-tier rate limit
  });
});
