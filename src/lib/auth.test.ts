import { beforeEach, describe, expect, it, vi } from "vitest";

// Role derivation and route guards (CLAUDE.md rule 3; ARCHITECTURE.md section 2). Database and Clerk are mocked:
// the database side (whoami / link_clerk_user / lockout) is proven by db/tests.
vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T>(f: T) => f }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); } }));

const clerk = { userId: "user_1" as string | null, email: { emailAddress: "Asha@Example.in", verification: { status: "verified" } } as unknown };
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: clerk.userId }),
  currentUser: async () => ({ primaryEmailAddress: clerk.email }),
}));
const db = { me: null as unknown, linked: [] as unknown[][] };
vi.mock("@/lib/db/client", () => ({
  systemSql: () => (...a: unknown[]) => { db.linked.push(a); return Promise.resolve([]); },
  withUser: async () => [[{ me: db.me }]],
}));
const flags = { clerkEnabled: true };
vi.mock("@/lib/clerk-config", () => ({ get clerkEnabled() { return flags.clerkEnabled; } }));

const load = async () => (await import("./auth"));
const me = (hr: boolean, mgr: boolean) => ({ id: "e1", full_name: "Asha Naik", is_hr_admin: hr, is_manager: mgr, location_name: "Panaji Head Office" });

beforeEach(() => {
  flags.clerkEnabled = true; clerk.userId = "user_1"; db.me = null; db.linked = [];
  clerk.email = { emailAddress: "Asha@Example.in", verification: { status: "verified" } };
  process.env.DATABASE_URL = "postgres://stub";
});

describe("roleOf (RESEARCH DV roles; ARCHITECTURE: only is_hr_admin is stored, Manager is derived)", () => {
  it("HR beats manager beats employee", async () => {
    const { roleOf } = await load();
    expect(roleOf(true, true)).toBe("hr");
    expect(roleOf(false, true)).toBe("manager");
    expect(roleOf(false, false)).toBe("employee");
  });
});

describe("requireEmployee: default deny", () => {
  it("unknown to the database (unlinked, inactive, past last day) goes to /access-denied", async () => {
    const { requireEmployee } = await load();
    db.me = null;
    await expect(requireEmployee()).rejects.toThrow("REDIRECT:/access-denied");
  });
  it("no database configured fails closed", async () => {
    delete process.env.DATABASE_URL;
    const { requireEmployee } = await load();
    await expect(requireEmployee()).rejects.toThrow("REDIRECT:/access-denied");
  });
  it("no Clerk session fails closed", async () => {
    clerk.userId = null;
    const { requireEmployee } = await load();
    await expect(requireEmployee()).rejects.toThrow("REDIRECT:/access-denied");
  });
  it("links by VERIFIED email only", async () => {
    const { getMe } = await load();
    db.me = me(false, false);
    await getMe();
    expect(db.linked).toHaveLength(1);
    expect(db.linked[0].slice(1)).toEqual(["user_1", "asha@example.in"]);
    db.linked = [];
    clerk.email = { emailAddress: "asha@example.in", verification: { status: "unverified" } };
    await getMe();
    expect(db.linked).toHaveLength(0);
  });
});

describe("requireRole: server-side route guard", () => {
  it("employee is sent home from manager pages; the URL ?role= changes nothing", async () => {
    const { requireRole } = await load();
    db.me = me(false, false);
    await expect(requireRole("manager", "hr")).rejects.toThrow("REDIRECT:/");
  });
  it("manager passes manager pages but not HR pages", async () => {
    const { requireRole } = await load();
    db.me = me(false, true);
    expect((await requireRole("manager")).role).toBe("manager");
    await expect(requireRole("hr")).rejects.toThrow("REDIRECT:/");
  });
  it("HR passes everything", async () => {
    const { requireRole } = await load();
    db.me = me(true, false);
    expect((await requireRole("hr")).role).toBe("hr");
  });
});

describe("demo mode (no Clerk keys): sample data only", () => {
  it("?role= picks the view and the person is marked demo", async () => {
    flags.clerkEnabled = false;
    const { getMe } = await load();
    expect(await getMe("hr")).toMatchObject({ role: "hr", demo: true });
    expect(await getMe("bogus")).toMatchObject({ role: "employee", demo: true });
  });
});
