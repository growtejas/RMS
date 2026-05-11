#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = process.cwd();
const envPath = path.join(root, ".env.local");

function hasBinary(command) {
  const probe = spawnSync("bash", ["-lc", `command -v ${command}`], {
    encoding: "utf8",
  });
  return probe.status === 0;
}

function hasDockerCompose() {
  const plugin = spawnSync("bash", ["-lc", "docker compose version"], {
    encoding: "utf8",
  });
  if (plugin.status === 0) return true;
  const standalone = spawnSync("bash", ["-lc", "command -v docker-compose"], {
    encoding: "utf8",
  });
  return standalone.status === 0;
}

function readEnvLocal() {
  if (!fs.existsSync(envPath)) return "";
  return fs.readFileSync(envPath, "utf8");
}

function hasEnvKey(content, key) {
  const re = new RegExp(`^\\s*${key}=`, "m");
  return re.test(content);
}

const envText = readEnvLocal();
const requiredEnv = [
  "RMS_OTEL_ENABLED",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "METRICS_BEARER_TOKEN",
  "RMS_AUTH_FASTPATH",
  "RMS_RANKING_NO_ENQUEUE",
  "RMS_USE_READ_REPLICA",
];

const checks = [
  { name: "k6 installed", ok: hasBinary("k6") },
  { name: "docker installed", ok: hasBinary("docker") },
  { name: "docker compose installed", ok: hasDockerCompose() },
  { name: ".env.local exists", ok: fs.existsSync(envPath) },
  ...requiredEnv.map((key) => ({
    name: `env key ${key} present`,
    ok: hasEnvKey(envText, key),
  })),
];

let failing = 0;
for (const check of checks) {
  if (check.ok) {
    console.log(`PASS  ${check.name}`);
  } else {
    console.log(`FAIL  ${check.name}`);
    failing += 1;
  }
}

if (failing > 0) {
  console.log(
    `\n${failing} prerequisite(s) missing. Run 'npm run setup:observability' first, then install system tools.`,
  );
  process.exitCode = 1;
} else {
  console.log("\nAll readiness prerequisites are satisfied.");
}
