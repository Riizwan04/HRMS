import { defineConfig } from "vitest/config";
import path from "node:path";

// Integration tests (need the local test database): run with `npm run test:int`.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "src/test/empty.ts") } },
  test: { include: ["src/**/*.int.test.ts"], environment: "node", fileParallelism: false, testTimeout: 20000 },
});
