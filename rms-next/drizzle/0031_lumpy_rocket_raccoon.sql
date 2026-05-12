-- Drizzle drift baseline: snapshots 0008..0030 were never committed to the repo, so
-- `drizzle-kit generate` reconstructs state from 0007 and emits a large catch-up diff.
-- This file is intentionally a no-op: every object referenced here was already created
-- by migrations 0008..0030. Committing the accompanying drizzle/meta/0031_snapshot.json
-- captures the true current schema state so future `db:check` runs are clean.
--
-- DO NOT add `CREATE TABLE` / `ADD COLUMN ... NOT NULL` here without `IF NOT EXISTS`
-- guards; doing so will break any database that has already applied 0030.
SELECT 1 WHERE FALSE;
