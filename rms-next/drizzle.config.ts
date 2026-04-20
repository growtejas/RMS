import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

import { defineConfig } from "drizzle-kit";

/** Match Next.js: CLI migrations read `DATABASE_URL` from disk, not only the shell. */
function loadEnvFromFile(fileName: string) {
  const full = resolve(process.cwd(), fileName);
  if (!existsSync(full)) return;
  const text = readFileSync(full, "utf8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/^\uFEFF/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadEnvFromFile(".env.local");
loadEnvFromFile(".env");

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
