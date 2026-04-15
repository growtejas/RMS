import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";

import { getDb } from "@/lib/db";
import type * as schema from "@/lib/db/schema";

type Schema = typeof schema;
type Relations = ExtractTablesWithRelations<Schema>;

/** Drizzle client or transaction handle (same query API). */
export type AppDb =
  | ReturnType<typeof getDb>
  | PgTransaction<PostgresJsQueryResultHKT, Schema, Relations>;
