import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Options } from "postgres";

import { noteDbQuery } from "@/lib/perf/request-perf";
import * as schema from "./schema";

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Phase 5 - DB topology.
 *
 * The system uses three distinct connection classes so that one workload
 * cannot exhaust the connections needed by another:
 *
 *   1. `getDb()`        - web pod, primary, write-capable. Sized small
 *                          (default max=4) because pgBouncer multiplexes.
 *   2. `getReadDb()`    - web pod, read replica. Routes that already do
 *                          read-only work (audit, status history, ranking
 *                          snapshot reads, applications lists) attach here
 *                          when `DATABASE_READ_URL` and `RMS_USE_READ_REPLICA`
 *                          are configured. Falls back to the primary in dev.
 *   3. `getWorkerDb()`  - background worker fleet. Larger pool, longer
 *                          statement timeout, prepared statements enabled
 *                          (workers connect direct to Postgres, not
 *                          pgBouncer in transaction mode).
 *
 * In production, the web tier connects through pgBouncer (transaction
 * pooling). `prepare: false` is required there because pgBouncer cannot
 * route prepared statements across multiplexed sessions.
 */

type DbHandle = {
  sql: ReturnType<typeof postgres>;
  db: DrizzleDb;
};

type GlobalDbCache = {
  primary?: DbHandle;
  read?: DbHandle;
  worker?: DbHandle;
};

const globalForDb = globalThis as unknown as {
  __rmsDb?: GlobalDbCache;
};

function ensureCache(): GlobalDbCache {
  if (!globalForDb.__rmsDb) {
    globalForDb.__rmsDb = {};
  }
  return globalForDb.__rmsDb;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function buildHandle(opts: {
  url: string;
  max: number;
  prepare: boolean;
  statementTimeoutMs: number;
  /** "web", "read", or "worker" - used in connection labels for pg_stat_activity. */
  label: string;
}): DbHandle {
  const sqlOptions: Options<Record<string, never>> = {
    max: opts.max,
    prepare: opts.prepare,
    debug: () => {
      noteDbQuery();
    },
    connection: {
      // Surface the role in pg_stat_activity / postgres logs so on-call can
      // distinguish "web saturated me" from "worker saturated me".
      application_name: `rms-next:${opts.label}`,
      // Enforce per-class statement timeouts at the session level so a slow
      // query cannot hold a pool slot indefinitely.
      statement_timeout: opts.statementTimeoutMs,
    },
  };
  const sql = postgres(opts.url, sqlOptions);
  const db = drizzle(sql, { schema });
  return { sql, db };
}

function isWorkerEnv(): boolean {
  return process.env.RMS_PROCESS_ROLE === "worker";
}

function defaultPrimaryMax(): number {
  // Workers don't share this pool, but if the same code is loaded inside a
  // worker (e.g. for repository helpers) we want a sane default. The web
  // default leans on pgBouncer multiplexing for fan-out.
  return intEnv("DATABASE_WEB_POOL_MAX", isWorkerEnv() ? 8 : 4);
}

function defaultPrimaryPrepare(): boolean {
  // Web behind pgBouncer (transaction mode) MUST disable prepared statements.
  // Set DATABASE_PREPARE=true only if you connect directly to Postgres.
  if (process.env.DATABASE_PREPARE != null) {
    return process.env.DATABASE_PREPARE === "true";
  }
  return isWorkerEnv();
}

function primaryStatementTimeoutMs(): number {
  // Web write requests should fail fast (10s); worker statements may be
  // long (parsing, ranking) so workers raise this in `getWorkerDb()`.
  return intEnv("DATABASE_STATEMENT_TIMEOUT_MS", 10_000);
}

/** Web pod, primary, write-capable. Throws if `DATABASE_URL` is unset. */
export function getDb(): DrizzleDb {
  const cache = ensureCache();
  if (cache.primary) {
    return cache.primary.db;
  }
  const url = process.env.DATABASE_URL;
  if (!url?.trim()) {
    throw new Error("DATABASE_URL is not set");
  }
  cache.primary = buildHandle({
    url: url.trim(),
    max: defaultPrimaryMax(),
    prepare: defaultPrimaryPrepare(),
    statementTimeoutMs: primaryStatementTimeoutMs(),
    label: isWorkerEnv() ? "worker-primary" : "web-primary",
  });
  return cache.primary.db;
}

/**
 * Read replica handle for read-heavy GETs. Falls back to the primary when
 * `DATABASE_READ_URL` is unset or the rollout flag `RMS_USE_READ_REPLICA`
 * is `false`.
 */
export function getReadDb(): DrizzleDb {
  if (process.env.RMS_USE_READ_REPLICA === "false") {
    return getDb();
  }
  const url = process.env.DATABASE_READ_URL?.trim();
  if (!url) {
    return getDb();
  }
  const cache = ensureCache();
  if (cache.read) {
    return cache.read.db;
  }
  cache.read = buildHandle({
    url,
    max: intEnv("DATABASE_READ_POOL_MAX", 4),
    prepare: defaultPrimaryPrepare(),
    statementTimeoutMs: intEnv("DATABASE_READ_STATEMENT_TIMEOUT_MS", 3_000),
    label: "web-read",
  });
  return cache.read.db;
}

/**
 * Worker pool. Connects direct to Postgres (no pgBouncer) so prepared
 * statements stay enabled and long-running parsing flows can hold a
 * connection across multiple statements without breaking pool semantics.
 */
export function getWorkerDb(): DrizzleDb {
  const cache = ensureCache();
  if (cache.worker) {
    return cache.worker.db;
  }
  const url = process.env.DATABASE_WORKER_URL?.trim() || process.env.DATABASE_URL;
  if (!url?.trim()) {
    throw new Error("DATABASE_URL is not set (worker)");
  }
  cache.worker = buildHandle({
    url: url.trim(),
    max: intEnv("DATABASE_WORKER_POOL_MAX", 4),
    prepare: true,
    statementTimeoutMs: intEnv("DATABASE_WORKER_STATEMENT_TIMEOUT_MS", 60_000),
    label: "worker",
  });
  return cache.worker.db;
}
