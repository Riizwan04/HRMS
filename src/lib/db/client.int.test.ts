import { describe, expect, it } from "vitest";
import { q, runSystem, withUser } from "./client";

describe("withUser against the real database (ARCHITECTURE section 2, CLAUDE.md rule 7)", () => {
  it("acts as the claimed user: whoami returns that person", async () => {
    const [[row]] = await withUser({ sub: "u_emp1" }, [q`select public.whoami() as me`]);
    expect((row.me as { full_name: string }).full_name).toBe("Asha Naik");
  });
  it("an unknown subject sees nobody (default deny)", async () => {
    const [[row]] = await withUser({ sub: "nobody" }, [q`select public.whoami() as me`]);
    expect(row.me).toBeNull();
  });
  it("a query outside withUser cannot read tables (runtime login owns nothing)", async () => {
    await expect(runSystem(q`select count(*) from public.employees`)).rejects.toThrow(/permission denied/);
  });
  it("the claim does not leak between calls", async () => {
    await withUser({ sub: "u_hr" }, [q`select 1`]);
    const [[row]] = await withUser({ sub: "nobody" }, [q`select public.whoami() as me`]);
    expect(row.me).toBeNull();
  });
});
