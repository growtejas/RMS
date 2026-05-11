#!/usr/bin/env bash
# RMS Next — local development command reference and shortcuts.
# Usage:
#   chmod +x scripts/rms-local-dev-commands.sh
#   ./scripts/rms-local-dev-commands.sh help
#   ./scripts/rms-local-dev-commands.sh install
#   ./scripts/rms-local-dev-commands.sh migrate
#   ./scripts/rms-local-dev-commands.sh dev
#   ./scripts/rms-local-dev-commands.sh workers-bg   # all workers in background (one terminal)
#   ./scripts/rms-local-dev-commands.sh obs-up
#
# Prerequisites (not Dockerized by this repo’s app itself):
#   - PostgreSQL reachable at DATABASE_URL
#   - Redis at REDIS_URL (required for BullMQ workers)
#   - Copy .env.example → .env.local and fill secrets (JWT_SECRET_KEY, etc.)
#
# =============================================================================
# GIT (run from your clone root; repo path may differ)
# =============================================================================
#   git clone <YOUR_REPO_URL> RMS
#   cd RMS/rms-next
#   git status
#   git pull origin main
#   git checkout -b feature/your-branch
#   git add -A && git commit -m "Describe the change."
#   git push -u origin feature/your-branch
#
# =============================================================================
# INSTALL
# =============================================================================
#   cd /path/to/RMS/rms-next
#   npm ci
#   # or: npm install
#
# =============================================================================
# DATABASE (Drizzle)
# =============================================================================
#   npm run db:migrate
#   npm run db:studio
#   npm run db:generate
#
# =============================================================================
# START WEB SERVER
# =============================================================================
#   npm run dev              # development (http://localhost:3000)
#   npm run build && npm run start   # production-like local
#
# =============================================================================
# WORKERS (each needs REDIS_URL + DATABASE_URL; run in separate terminals
#          or use: ./scripts/rms-local-dev-commands.sh workers-bg)
# =============================================================================
#   npm run worker:process-event
#   npm run worker:bulk-import
#   npm run worker:resume-structure
#   npm run worker:notification-delivery
#   npm run worker:lifecycle-reminders
#   npm run worker:cie-intelligence
#   npm run worker:ai-evaluation
#   npm run worker:ai-eval-backfill
#   npm run worker:report-aggregation
#
# Repeat-only workers (ai-eval-backfill, lifecycle-reminders, report-aggregation):
#   run a single instance in production-style setups (see docs/perf/queue-topology.md).
#
# =============================================================================
# DOCKER — local observability stack (Prometheus / Grafana / OTEL, etc.)
# =============================================================================
#   npm run setup:observability
#   npm run obs:up
#   npm run obs:logs
#   npm run obs:down
#   # Under the hood: ops/observability/docker-compose.yml
#
# =============================================================================
# OTHER NPM SCRIPTS
# =============================================================================
#   npm run lint
#   npm run check:readiness
#   npm run test:unit
#   npm run test:e2e
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

print_help() {
  sed -n '2,/^set -euo pipefail$/p' "$0" | head -n -1
}

cmd_install() {
  npm ci
}

cmd_migrate() {
  npm run db:migrate
}

cmd_dev() {
  npm run dev
}

cmd_workers_bg() {
  echo "Starting ${#WORKERS[@]} workers in background from $ROOT ..."
  for w in "${WORKERS[@]}"; do
    echo "  → $w"
    npm run "$w" &
  done
  echo "All worker npm processes started. Logs interleave in this terminal."
  echo "Stop with: kill \$(jobs -p)  (or close the terminal)"
  wait
}

cmd_obs_up() {
  npm run obs:up
}

cmd_obs_down() {
  npm run obs:down
}

cmd_obs_logs() {
  npm run obs:logs
}

case "${1:-help}" in
  help|--help|-h)
    print_help
    echo ""
    echo "Shortcuts: install | migrate | dev | workers-bg | obs-up | obs-down | obs-logs"
    ;;
  install)
    cmd_install
    ;;
  migrate)
    cmd_migrate
    ;;
  dev)
    cmd_dev
    ;;
  workers-bg)
    cmd_workers_bg
    ;;
  obs-up)
    cmd_obs_up
    ;;
  obs-down)
    cmd_obs_down
    ;;
  obs-logs)
    cmd_obs_logs
    ;;
  *)
    echo "Unknown command: $1"
    echo "Run: $0 help"
    exit 1
    ;;
esac
