import type { Me, Role } from "@/lib/auth";
import { q, withUser } from "@/lib/db/client";

// Fixture people (db/tests/_fixtures.inc): Clerk sub is u_<code>.
export const PEOPLE: Record<string, { sub: string; name: string; role: Role }> = {
  hr: { sub: "u_hr", name: "Hema HR", role: "hr" },
  mgr: { sub: "u_mgr", name: "Mohan Manager", role: "manager" },
  mgr2: { sub: "u_mgr2", name: "Meena Plant Manager", role: "manager" },
  emp1: { sub: "u_emp1", name: "Asha Naik", role: "employee" },
  emp2: { sub: "u_emp2", name: "Ravi Kamat", role: "employee" },
  joiner: { sub: "u_joiner", name: "Joy Joiner", role: "employee" },
  plant1: { sub: "u_plant1", name: "Pavan Fal", role: "employee" },
};

export const current = { who: "emp1" };
export const as = (code: keyof typeof PEOPLE) => { current.who = code; };

/** The signed-in person for module code under test; the database still decides everything via the claim. */
export async function mockSession(): Promise<Me> {
  const p = PEOPLE[current.who];
  const [[row]] = await withUser({ sub: p.sub }, [q`select public.whoami() as me`]);
  const me = row.me as { id: string; location_id: string; location_name: string; manager_name: string | null };
  return { id: me.id, sub: p.sub, name: p.name, role: p.role, locationId: me.location_id, locationName: me.location_name, managerName: me.manager_name, demo: false };
}
/** Use at the top of an integration test: vi.mock("@/lib/auth", async () => (await import("@/test/int-helpers")).authMock()); */
export const authMock = () => ({ requireEmployee: mockSession, requireRole: mockSession });

/** Id of a fixture person (read through their own session). */
export async function idOf(code: keyof typeof PEOPLE): Promise<string> {
  const [[row]] = await withUser({ sub: PEOPLE[code].sub }, [q`select public.whoami()->>'id' as id`]);
  return row.id as string;
}
