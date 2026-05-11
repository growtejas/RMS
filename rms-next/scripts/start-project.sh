#!/usr/bin/env bash
# RMS Next — start local dev (macOS / Linux / Git Bash on Windows).
# Do not use start-project.ps1 here — that is Windows PowerShell only.
# Delegates to Node so behavior matches PowerShell and avoids bash version/CRLF issues.
#
# Usage (from rms-next):
#   ./scripts/start-project.sh
#   ./scripts/start-project.sh --workers
#   START_WORKERS=1 ./scripts/start-project.sh
#
cd "$(dirname "$0")/.." || exit 1
exec node scripts/start-local.cjs "$@"
