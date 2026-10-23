// Usage: node scripts/screenshot.mjs <baseUrl> <outDir> "<path>|<name>|desktop or phone|<actions>" ...
// actions (optional, ; separated): sel:<css>=<value>  or  click:<css>
// Takes full-page screenshots with the preinstalled Chromium (used for visual checks while building).
import { chromium } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";

const [base, outDir, ...jobs] = process.argv.slice(2);
const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
const dir = readdirSync(root).find((d) => d.startsWith("chromium"));
const candidates = [`${root}/${dir}/chrome-linux/chrome`, `${root}/chromium`];
const executablePath = candidates.find(existsSync);
const browser = await chromium.launch({ executablePath });
for (const job of jobs) {
  const [path, name, size, actions] = job.split("|");
  const viewport = size === "phone" ? { width: 390, height: 844 } : { width: 1280, height: 800 };
  const page = await browser.newPage({ viewport });
  await page.goto(base + path, { waitUntil: "load" });
  for (const a of (actions ?? "").split(";").filter(Boolean)) {
    const [kind, rest] = [a.slice(0, a.indexOf(":")), a.slice(a.indexOf(":") + 1)];
    if (kind === "sel") { const [css, val] = rest.split("="); await page.selectOption(css, val); }
    if (kind === "click") await page.click(rest);
  }
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  await page.close();
}
await browser.close();
