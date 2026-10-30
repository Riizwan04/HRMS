import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// The one door to the database (ARCHITECTURE.md section 2). Every request runs as the signed-in user:
// one atomic batch = SET LOCAL ROLE authenticated + the verified Clerk subject as a session claim + the queries.
// Connects as `app_runtime` (owns nothing, no table privileges), so a query outside withUser() fails.

export type Claims = { sub: string };
type Sql = NeonQueryFunction<false, false>;
type Row = Record<string, unknown>;

let cached: Sql | null = null;
function runtime(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return (cached ??= neon(url));
}

/** Build the queries with the tagged-template `q`; they run in one transaction as the claimed user. Returns one rows array per query. */
export async function withUser(claims: Claims, build: (q: Sql) => ReturnType<Sql>[]): Promise<Row[][]> {
  if (!claims.sub) throw new Error("withUser needs a verified subject");
  const sql = runtime();
  const claimJson = JSON.stringify({ sub: claims.sub, role: "authenticated" });
  const out = await sql.transaction((tx) => [
    tx`set local role authenticated`,
    tx`select set_config('request.jwt.claims', ${claimJson}, true)`,
    ...build(tx as unknown as Sql),
  ]);
  return (out as Row[][]).slice(2);
}

/** First-login linking and the email worker are the only calls made without a user (narrow SECURITY DEFINER functions). */
export function systemSql(): Sql {
  return runtime();
}
