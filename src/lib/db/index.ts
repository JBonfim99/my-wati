import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export * from "./schema";

export type AppDb = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  queryClient?: postgres.Sql;
  db?: AppDb;
};

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

/**
 * Server / worker connection. Use `DATABASE_URL` with **service role** (bypasses RLS).
 * All queries MUST filter by `tenant_id` validated against the user's memberships in app code.
 * Singleton: one connection pool per process regardless of environment.
 */
export function getDb(): AppDb {
  if (globalForDb.db) return globalForDb.db;
  const client = postgres(getConnectionString(), { prepare: false, max: 15 });
  globalForDb.queryClient = client;
  globalForDb.db = drizzle(client, { schema });
  return globalForDb.db;
}
