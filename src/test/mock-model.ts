import { MockLanguageModelV4 } from "ai/test";

type Step = { text: string } | { tools: { name: string; input: Record<string, unknown> }[] };
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } };

/** A scripted stand-in for the language model: each call returns the next step (tool calls or a final answer). Records the prompts it saw. */
export function scriptedModel(steps: Step[]) {
  let i = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const s = steps[Math.min(i, steps.length - 1)]; i += 1;
      if ("text" in s) return { content: [{ type: "text" as const, text: s.text }], finishReason: { unified: "stop" as const, raw: undefined }, usage, warnings: [] };
      return {
        content: s.tools.map((t, k) => ({ type: "tool-call" as const, toolCallId: `call-${i}-${k}`, toolName: t.name, input: JSON.stringify(t.input) })),
        finishReason: { unified: "tool-calls" as const, raw: undefined }, usage, warnings: [],
      };
    },
  });
}
