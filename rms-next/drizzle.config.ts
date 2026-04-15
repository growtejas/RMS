import { defineConfig } from "drizzle-kit";

/**
 * Drizzle is the single source of truth for schema + migrations.
 *
 * - `src/lib/db/schema.ts` defines the schema.
 * - `rms-next/drizzle/` stores generated migration files.
 */
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
