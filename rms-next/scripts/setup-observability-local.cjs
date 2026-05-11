#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const envExamplePath = path.join(root, ".env.example");
const envLocalPath = path.join(root, ".env.local");

const observabilityBlock = `
# --- Phase 8 local observability bootstrap ---
# Enable OTel only when collector endpoint is reachable.
RMS_OTEL_ENABLED=false
OTEL_SERVICE_NAME=rms-next-local
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318/v1/traces

# Protect /api/metrics in non-dev environments.
METRICS_BEARER_TOKEN=change-me-local-token

# Rollback toggles (keep visible for quick rollback drills).
RMS_AUTH_FASTPATH=true
RMS_RANKING_NO_ENQUEUE=true
RMS_USE_READ_REPLICA=false
`;

function ensureEnvLocal() {
  if (!fs.existsSync(envLocalPath)) {
    if (!fs.existsSync(envExamplePath)) {
      throw new Error(".env.example not found; cannot bootstrap .env.local");
    }
    fs.copyFileSync(envExamplePath, envLocalPath);
    console.log("Created .env.local from .env.example");
  } else {
    console.log(".env.local already exists");
  }
}

function appendBlockIfMissing() {
  const content = fs.readFileSync(envLocalPath, "utf8");
  if (content.includes("Phase 8 local observability bootstrap")) {
    console.log("Observability block already present in .env.local");
    return;
  }
  const next = `${content.trimEnd()}\n${observabilityBlock}`;
  fs.writeFileSync(envLocalPath, `${next.trimEnd()}\n`, "utf8");
  console.log("Appended observability block to .env.local");
}

try {
  ensureEnvLocal();
  appendBlockIfMissing();
  console.log("Local observability env bootstrap complete.");
} catch (error) {
  console.error(
    `setup-observability-local failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
