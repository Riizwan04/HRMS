import { Client } from "pg";

/** Test-only: run SQL as the database owner (e.g. move a punch back in time, because the test clock is frozen). */
export async function adminSql(text: string, values: unknown[] = []): Promise<void> {
  const c = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
  await c.connect();
  try { await c.query(text, values); } finally { await c.end(); }
}
