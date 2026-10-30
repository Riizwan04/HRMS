// Owner/admin connection: migrations and seed ONLY (scripts/). Never imported by src/ (ESLint rule) and never set on Vercel.
import { Client } from "pg";

export async function withAdmin<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL_ADMIN;
  if (!url) throw new Error("DATABASE_URL_ADMIN is not set");
  const c = new Client({ connectionString: url });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}
