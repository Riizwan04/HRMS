import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // CLAUDE.md rule 1: clocks and time zones live only in src/lib/time/ist.ts.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/time/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name=/^(getHours|getMinutes|getSeconds|getDate|getDay|getMonth|getFullYear|getTimezoneOffset|toLocaleString|toLocaleDateString|toLocaleTimeString)$/]",
          message: "Use the IST helpers in src/lib/time/ist.ts (no local-time getters or locale formatting).",
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "Use nowIST() / todayIST() from src/lib/time/ist.ts.",
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: "Use nowIST() from src/lib/time/ist.ts.",
        },
      ],
    },
  },
  // CLAUDE.md rule 7: the owner/admin connection is for scripts/ only.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/db/admin.ts", "src/lib/db/client.ts", "src/test/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [
        { group: ["**/db/admin", "pg"], message: "The admin database connection is for scripts/ only." },
      ] }],
    },
  },
]);

export default eslintConfig;
