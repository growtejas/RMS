#!/usr/bin/env node
/**
 * Launcher when you run from the git repo root (`RMS/`), not `rms-next/`.
 * Forwards to rms-next/scripts/start-local.cjs with cwd set to rms-next.
 */
"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const rmsNext = path.join(repoRoot, "rms-next");
const target = path.join(rmsNext, "scripts", "start-local.cjs");

const fs = require("node:fs");
if (!fs.existsSync(target)) {
  console.error(
    "[start-local] Expected Next app at:",
    rmsNext,
    "\n  Run from rms-next instead: cd rms-next && node scripts/start-local.cjs",
  );
  process.exit(1);
}

const result = spawnSync(process.execPath, [target, ...process.argv.slice(2)], {
  cwd: rmsNext,
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
