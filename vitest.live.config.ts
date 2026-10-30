import { defineConfig } from "vitest/config";
import path from "node:path";

// Live checks that call the real model and database: `npm run agent:prompts` (needs Neon + the Gemini key).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "src/test/empty.ts") } },
  test: { include: ["src/**/*.live.test.ts"], environment: "node", fileParallelism: false, testTimeout: 120000 },
});
