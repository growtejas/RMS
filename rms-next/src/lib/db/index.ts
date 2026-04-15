import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>;
  db?: DrizzleDb;
};

/**
 * Single connection pool in dev (survives HMR). Throws if `DATABASE_URL` is unset.
 */
export function getDb(): DrizzleDb {
  const url = process.env.DATABASE_URL;
  if (!url?.trim()) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!globalForDb.sql) {
    globalForDb.sql = postgres(url, { max: 10 });
    globalForDb.db = drizzle(globalForDb.sql, { schema });
  }
  return globalForDb.db!;
}
