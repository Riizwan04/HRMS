import "server-only";
import { neon } from "@neondatabase/serverless";
import type { Pool as PgPool } from "pg";

// The one door to the database (ARCHITECTURE.md section 2). Every request runs as the signed-in user:
// one atomic batch = SET LOCAL ROLE authenticated + the verified Clerk subject as a session claim + the queries.
// Connects as `app_runtime` (owns nothing, no table privileges), so a query outside withUser() fails.
// Neon hosts use the HTTP driver (serverless-friendly); any other host (local Postgres for tests) uses node-postgres.

export type Claims = { sub: string };
export type Row = Record<string, unknown>;
export type Query = { text: string; values: unknown[] };

/** Tagged template that builds a parameterised query: q`select * from f(${a}, ${b})` -> "... f($1, $2)". Values are never interpolated into SQL text. */
export function q(strings: TemplateStringsArray, ...values: unknown[]): Query {
  return { text: strings.reduce((acc, s, i) => acc + (i ? `$${i}` : "") + s), values };
}

function url(): string {
  const u = process.env.DATABASE_URL;
  if (!u) throw new Error("DATABASE_URL is not set");
  return u;
}
const isNeon = () => /neon\.tech/.test(url());

let httpSql: ReturnType<typeof neon> | null = null;
let pgPool: PgPool | null = null;
async function pool(): Promise<PgPool> {
  if (!pgPool) { const { Pool } = await import("pg"); pgPool = new Pool({ connectionString: url(), max: 4 }); }
  return pgPool;
}

/** Runs the queries in one transaction as the claimed user. Returns one rows array per query. */
export async function withUser(claims: Claims, queries: Query[]): Promise<Row[][]> {
  if (!claims.sub) throw new Error("withUser needs a verified subject");
  const claimJson = JSON.stringify({ sub: claims.sub, role: "authenticated" });

  if (isNeon()) {
    const sql = (httpSql ??= neon(url()));
    const out = await sql.transaction((tx) => [
      tx.query("set local role authenticated"),
      tx.query("select set_config('request.jwt.claims', $1, true)", [claimJson]),
      ...queries.map((x) => tx.query(x.text, x.values)),
    ]);
    return (out as Row[][]).slice(2);
  }

  const client = await (await pool()).connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [claimJson]);
    const out: Row[][] = [];
    for (const x of queries) out.push((await client.query(x.text, x.values)).rows);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

/** First-login linking and the email worker are the only calls made without a user (narrow SECURITY DEFINER functions). */
export async function runSystem(query: Query): Promise<Row[]> {
  if (isNeon()) return (await (httpSql ??= neon(url())).query(query.text, query.values)) as Row[];
  return (await (await pool()).query(query.text, query.values)).rows;
}
