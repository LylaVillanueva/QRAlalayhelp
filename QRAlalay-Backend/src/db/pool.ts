import { Pool } from "pg";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/config/env";

/**
 * Raw Postgres pool for business-logic queries (transactions, joins,
 * row locking for the timeout engine, etc). This is the primary path
 * for all API read/write operations.
 */
export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  // Verify the database server's certificate in production. Disabling
  // certificate checks would allow a network attacker to impersonate DB.
  ssl: env.isProd ? { rejectUnauthorized: true } : undefined,
});

pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("[pg pool] unexpected idle client error", err);
});

/**
 * Supabase client using the SERVICE ROLE key — used only for storage
 * (QR print assets, resident photos) and any managed features we don't
 * want to reimplement. This key bypasses RLS, so it must never be sent
 * to a client. All request-level authorization happens in our own
 * middlewares (see src/middlewares/rbac.ts), not in Supabase policies.
 */
export const supabaseAdmin = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
  auth: { persistSession: false },
});

export async function withTransaction<T>(fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
