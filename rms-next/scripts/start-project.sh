#!/usr/bin/env bash
# Start RMS Next locally (Next dev server).
#
# Usage:
#   ./scripts/start-project.sh
#   START_WORKERS=1 ./scripts/start-project.sh   # also spawn all BullMQ workers in background
#
# Prerequisites: PostgreSQL (DATABASE_URL), Redis (REDIS_URL) when using workers or queued features.
# Env: copy rms-next/.env.example → .env.local and fill values.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WORKERS=(
  worker:process-event
  worker:bulk-import
  worker:resume-structure
  worker:notification-delivery
  worker:lifecycle-reminders
  worker:cie-intelligence
  worker:ai-evaluation
  worker:ai-eval-backfill
  worker:report-aggregation
)

WORKER_PIDS=()

cleanup() {
  if [[ "${#WORKER_PIDS[@]}" -gt 0 ]]; then
    echo ""
    echo "Stopping background workers..."
    for pid in "${WORKER_PIDS[@]}"; do
      kill "$pid" 2>/dev/null || true
    done
  fi
}
trap cleanup EXIT INT TERM

if [[ ! -f .env.local && ! -f .env ]]; then
  echo "Warning: no .env.local or .env in $ROOT — copy .env.example to .env.local" >&2
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm not found. Install Node.js LTS." >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies (first run)..."
  npm ci 2>/dev/null || npm install
fi

if [[ "${START_WORKERS:-}" == "1" ]]; then
  echo "Starting ${#WORKERS[@]} workers in background (Redis required)..."
  for w in "${WORKERS[@]}"; do
    npm run "$w" &
    WORKER_PIDS+=("$!")
  done
  echo "Workers started (PIDs: ${WORKER_PIDS[*]}). Logs will mix with dev server below."
  echo ""
fi

echo "Starting Next.js dev server → http://localhost:3000"
echo "Press Ctrl+C to stop."
echo ""

npm run dev
