// Applies db/migrations/*.sql to the database named by DATABASE_URL_ADMIN, once each, in order.
// Run on a developer machine (never on Vercel):  npm run db:migrate
// Optional APP_RUNTIME_PASSWORD sets the password of the limited runtime login (app_runtime) after the migrations.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { withAdmin } from "../src/lib/db/admin";

const dir = join(__dirname, "..", "db", "migrations");

withAdmin(async (c) => {
  await c.query("create schema if not exists kinara_meta");
  await c.query("create table if not exists kinara_meta.migrations (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await c.query("select name from kinara_meta.migrations")).rows.map((r) => r.name as string));
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    if (done.has(f)) { console.log(`skip   ${f}`); continue; }
    await c.query("begin");
    try {
      await c.query(readFileSync(join(dir, f), "utf8"));
      await c.query("insert into kinara_meta.migrations(name) values ($1)", [f]);
      await c.query("commit");
      console.log(`applied ${f}`);
    } catch (e) {
      await c.query("rollback");
      throw new Error(`${f} failed: ${(e as Error).message}`);
    }
  }
  const pw = process.env.APP_RUNTIME_PASSWORD;
  if (pw) {
    await c.query(`alter role app_runtime with login password ${await literal(c, pw)}`);
    console.log("app_runtime password set");
  }
}).catch((e) => { console.error(e.message); process.exit(1); });

async function literal(c: { query: (q: string, v?: unknown[]) => Promise<{ rows: { q: string }[] }> }, v: string) {
  return (await c.query("select quote_literal($1) as q", [v])).rows[0].q;
}
