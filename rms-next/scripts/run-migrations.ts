import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Same rules as `drizzle.config.ts` so CLI and Next share one source of truth. */
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

const envUrl = process.env.DATABASE_URL?.trim();
if (!envUrl) {
  console.error(
    "[rms-next] DATABASE_URL is empty. Set it in .env.local (same file Next.js uses).",
  );
  process.exit(1);
}
const url: string = envUrl;

async function main() {
  const migrationsFolder = resolve(process.cwd(), "drizzle");
  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql);

  try {
    console.log("[rms-next] Applying migrations from", migrationsFolder);
    await migrate(db, {
      migrationsFolder,
      migrationsSchema: "drizzle",
      migrationsTable: "__drizzle_migrations",
    });
    console.log("[rms-next] db:migrate finished successfully.\n");
  } catch (err) {
    console.error("[rms-next] db:migrate failed:\n");
    console.error(err);
    const msg = String(
      err && typeof err === "object" && "cause" in err
        ? (err as { cause?: { message?: string } }).cause?.message
        : "",
    );
    if (msg.includes("already exists")) {
      console.error(
        "\n[rms-next] Hint: DB objects exist but `drizzle.__drizzle_migrations` may be empty or stale. Baseline through the last migration that truly applied, then migrate again, e.g.:\n  npm run db:baseline-migrations -- --through-tag 0009_ats_v1_ranking\n  npm run db:migrate\n",
      );
    }
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
