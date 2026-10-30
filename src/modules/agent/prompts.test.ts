import { describe, expect, it } from "vitest";
import prompts from "./prompts.json";

// The attack/regression prompt file the brief asks for (at least 15). It is executed against the real model by
// `npm run agent:prompts` (needs Neon and the Gemini key); here we only keep the file honest.
describe("agent test prompts (brief: at least 15, incl. attacks and two Hinglish)", () => {
  it("has 15 or more prompts with unique ids and a valid role", () => {
    expect(prompts.length).toBeGreaterThanOrEqual(15);
    expect(new Set(prompts.map((p) => p.id)).size).toBe(prompts.length);
    for (const p of prompts) expect(["employee", "manager", "hr"]).toContain(p.role);
  });
  it("covers the brief's named attacks and at least two Hinglish prompts", () => {
    const text = prompts.map((p) => p.prompt.toLowerCase()).join(" | ");
    for (const must of ["aadhaar", "approve my own leave", "ignore your rules", "friday to monday", "kal ki chutti"]) expect(text).toContain(must);
    expect(prompts.filter((p) => /kal|mujhe|mera|karwa|kitni|nahi/i.test(p.prompt)).length).toBeGreaterThanOrEqual(2);
  });
  it("every regex in the file compiles", () => {
    for (const p of prompts as { answerMustMatch?: string; answerMustNotMatch?: string }[]) {
      if (p.answerMustMatch) new RegExp(p.answerMustMatch, "i");
      if (p.answerMustNotMatch) new RegExp(p.answerMustNotMatch, "i");
    }
  });
});
