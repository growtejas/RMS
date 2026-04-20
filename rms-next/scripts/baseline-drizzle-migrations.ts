/**
 * Mark every migration up to and including `--through-tag` as already applied
 * by inserting one row into `drizzle.__drizzle_migrations`.
 *
 * Use when the database already contains objects from those migrations (e.g. created
 * via `drizzle-kit push`, another tool, or a copy) but the migrations table is empty
 * or behind — otherwise `npm run db:migrate` will re-run 0000 and fail with
 * "relation ... already exists".
 *
 * Example (typical: schema is current through 0009, need 0010+):
 *   npm run db:baseline-migrations -- --through-tag 0009_ats_v1_ranking
 *   npm run db:migrate
 */
import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import postgres from "postgres";

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

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

loadEnvFromFile(".env.local");
loadEnvFromFile(".env");

const throughTag = argValue("--through-tag");
if (!throughTag?.trim()) {
  console.error(
    'Usage: npm run db:baseline-migrations -- --through-tag <journal_tag>\nExample: npm run db:baseline-migrations -- --through-tag 0009_ats_v1_ranking',
  );
  process.exit(1);
}

const envUrl = process.env.DATABASE_URL?.trim();
if (!envUrl) {
  console.error(
    "[rms-next] DATABASE_URL is empty. Set it in .env.local.",
  );
  process.exit(1);
}
const url: string = envUrl;

const journalPath = resolve(process.cwd(), "drizzle/meta/_journal.json");
const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
  entries: Array<{ tag: string; when: number }>;
};

const entry = journal.entries.find((e) => e.tag === throughTag);
if (!entry) {
  console.error(
    `[rms-next] Unknown tag "${throughTag}". See drizzle/meta/_journal.json.`,
  );
  process.exit(1);
}
const entryWhen: number = entry.when;

const sqlPath = resolve(process.cwd(), `drizzle/${throughTag}.sql`);
if (!existsSync(sqlPath)) {
  console.error(`[rms-next] Missing file: ${sqlPath}`);
  process.exit(1);
}

const fileBody = readFileSync(sqlPath, "utf8");
const hash = createHash("sha256").update(fileBody).digest("hex");

async function main() {
  const sql = postgres(url, { max: 1 });
  try {
    await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
    await sql`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `;
    await sql`
      INSERT INTO drizzle.__drizzle_migrations ("hash", "created_at")
      VALUES (${hash}, ${entryWhen})
    `;
    console.log(
      `[rms-next] Baseline recorded for ${throughTag} (created_at=${entryWhen}). Run: npm run db:migrate\n`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
