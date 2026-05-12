#!/usr/bin/env node
/**
 * RMS Next — one-command local start (Windows + macOS + Linux).
 *
 * From `rms-next` (the Next app folder):
 *   node scripts/start-local.cjs
 *
 * From git repo root (`RMS/`, parent of `rms-next`):
 *   node scripts/start-local.cjs
 *   (uses `RMS/scripts/start-local.cjs`, which forwards here)
 *   node scripts/start-local.cjs --workers
 *   node scripts/start-local.cjs --no-migrate
 *
 * Env (optional):
 *   START_WORKERS=1   same as --workers
 *   SKIP_DB_MIGRATE=1 skip `npm run db:migrate`
 *
 * Requires: Node/npm on PATH, .env.local (or .env), PostgreSQL for migrate + dev.
 * Workers need Redis (REDIS_URL).
 */
/* eslint-disable no-console */
"use strict";

const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const IS_WIN = process.platform === "win32";

const WORKERS = [
  "worker:process-event",
  "worker:bulk-import",
  "worker:resume-structure",
  "worker:notification-delivery",
  "worker:lifecycle-reminders",
  "worker:cie-intelligence",
  "worker:ai-evaluation",
  "worker:ai-eval-backfill",
  "worker:report-aggregation",
];

function hasFlag(name) {
  return process.argv.includes(name);
}

function runNpmSync(args, inherit = true) {
  const r = spawnSync("npm", args, {
    cwd: ROOT,
    shell: true,
    stdio: inherit ? "inherit" : "pipe",
    encoding: "utf8",
  });
  return r.status ?? 1;
}

function ensureDeps() {
  if (fs.existsSync(path.join(ROOT, "node_modules"))) {
    return 0;
  }
  console.log("[start-local] node_modules missing — installing dependencies…");
  let code = runNpmSync(["ci"]);
  if (code !== 0) {
    console.warn("[start-local] npm ci failed, trying npm install…");
    code = runNpmSync(["install"]);
  }
  return code;
}

function ensureEnvFile() {
  const hasLocal = fs.existsSync(path.join(ROOT, ".env.local"));
  const hasEnv = fs.existsSync(path.join(ROOT, ".env"));
  if (!hasLocal && !hasEnv) {
    console.warn(
      "[start-local] No .env.local or .env — copy .env.example to .env.local and set DATABASE_URL, JWT_SECRET_KEY, REDIS_URL, etc.",
    );
  }
}

function maybeMigrate() {
  if (hasFlag("--no-migrate") || String(process.env.SKIP_DB_MIGRATE || "").trim() === "1") {
    console.log("[start-local] Skipping database migrations (--no-migrate or SKIP_DB_MIGRATE=1).");
    return 0;
  }
  console.log("[start-local] Running database migrations (npm run db:migrate)…");
  const code = runNpmSync(["run", "db:migrate"]);
  if (code !== 0) {
    console.error(
      "[start-local] db:migrate failed. Fix DATABASE_URL / DB state, or run with --no-migrate to skip.",
    );
    return code;
  }
  return 0;
}

const workerChildren = [];
let devChild = null;
let shuttingDown = false;

function killProcessTree(child) {
  if (!child || !child.pid) return;
  try {
    if (IS_WIN) {
      spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], {
        shell: true,
        stdio: "ignore",
      });
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    /* ignore */
  }
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[start-local] Shutting down (${signal || "exit"})…`);
  for (const w of workerChildren) {
    killProcessTree(w);
  }
  workerChildren.length = 0;
  killProcessTree(devChild);
  devChild = null;
  process.exit(0);
}

function startWorkers() {
  const want =
    hasFlag("--workers") ||
    String(process.env.START_WORKERS || "").trim() === "1" ||
    /^true$/i.test(String(process.env.START_WORKERS || "").trim());
  if (!want) return;

  console.log(
    `[start-local] Starting ${WORKERS.length} BullMQ workers in the background (Redis + REDIS_URL required)…`,
  );
  for (const script of WORKERS) {
    const child = spawn("npm", ["run", script], {
      cwd: ROOT,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const tag = `[${script}]`;
    child.stdout?.on("data", (buf) => {
      process.stdout.write(`${tag} ${buf.toString("utf8")}`);
    });
    child.stderr?.on("data", (buf) => {
      process.stderr.write(`${tag} ${buf.toString("utf8")}`);
    });
    child.on("error", (err) => {
      console.error(`[start-local] Failed to spawn ${script}:`, err.message);
    });
    child.on("exit", (code, sig) => {
      if (!shuttingDown && code !== 0 && code !== null) {
        console.warn(`[start-local] ${script} exited with code ${code}${sig ? ` (${sig})` : ""}`);
      }
    });
    workerChildren.push(child);
  }
}

function startDev() {
  console.log("[start-local] Starting Next.js dev server → http://localhost:3000");
  console.log("[start-local] Press Ctrl+C to stop.\n");

  devChild = spawn("npm", ["run", "dev"], {
    cwd: ROOT,
    shell: true,
    stdio: "inherit",
  });

  devChild.on("error", (err) => {
    console.error("[start-local] Failed to start dev server:", err.message);
    process.exit(1);
  });

  devChild.on("exit", (code) => {
    if (!shuttingDown) {
      shutdown();
      process.exit(code ?? 0);
    }
  });
}

function main() {
  process.chdir(ROOT);
  ensureEnvFile();

  if (!process.env.PATH) {
    console.error("[start-local] PATH is empty — cannot find npm.");
    process.exit(1);
  }

  let code = ensureDeps();
  if (code !== 0) {
    console.error("[start-local] Dependency install failed.");
    process.exit(code);
  }

  code = maybeMigrate();
  if (code !== 0) {
    process.exit(code);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  startWorkers();
  startDev();
}

main();
