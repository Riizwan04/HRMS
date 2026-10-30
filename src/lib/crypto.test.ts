import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const load = async () => { vi.resetModules(); return import("./crypto"); };
const saved = { a: process.env.AADHAAR_ENCRYPTION_KEY, c: process.env.CLERK_SECRET_KEY };
afterEach(() => { process.env.AADHAAR_ENCRYPTION_KEY = saved.a; process.env.CLERK_SECRET_KEY = saved.c; if (saved.a === undefined) delete process.env.AADHAAR_ENCRYPTION_KEY; if (saved.c === undefined) delete process.env.CLERK_SECRET_KEY; });

describe("Aadhaar encryption (E7, LR-22)", () => {
  it("works with no extra setup by deriving the key from CLERK_SECRET_KEY", async () => {
    delete process.env.AADHAAR_ENCRYPTION_KEY; process.env.CLERK_SECRET_KEY = "sk_test_example_secret";
    const { aadhaarKeyConfigured, encryptAadhaar } = await load();
    expect(aadhaarKeyConfigured()).toBe(true);
    const r = encryptAadhaar("123456789012");
    expect(r.last4).toBe("9012");
    expect(Buffer.from(r.ct, "base64").length).toBe(12 + 16 + 12);
    expect(Buffer.from(r.ct, "base64").toString("latin1")).not.toContain("123456789012");
  });
  it("encrypting the same number twice gives different ciphertexts (random IV)", async () => {
    process.env.CLERK_SECRET_KEY = "sk_test_example_secret";
    const { encryptAadhaar } = await load();
    expect(encryptAadhaar("123456789012").ct).not.toBe(encryptAadhaar("123456789012").ct);
  });
  it("an explicit AADHAAR_ENCRYPTION_KEY takes priority and must be 32 bytes", async () => {
    delete process.env.CLERK_SECRET_KEY; process.env.AADHAAR_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    expect((await load()).aadhaarKeyConfigured()).toBe(true);
    process.env.AADHAAR_ENCRYPTION_KEY = "too-short";
    expect((await load()).aadhaarKeyConfigured()).toBe(false);
  });
  it("with no key material it refuses to store anything, and bad numbers are refused", async () => {
    delete process.env.AADHAAR_ENCRYPTION_KEY; delete process.env.CLERK_SECRET_KEY;
    const m = await load();
    expect(() => m.encryptAadhaar("123456789012")).toThrow("aadhaar_key_missing");
    process.env.CLERK_SECRET_KEY = "sk_test_x";
    expect(() => m.encryptAadhaar("1234")).toThrow("invalid_aadhaar");
  });
});
