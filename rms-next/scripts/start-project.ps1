# RMS Next — start local dev (Windows PowerShell ONLY).
# On Linux/macOS/Git Bash do NOT use this file — use: ./scripts/start-project.sh
#   or: node scripts/start-local.cjs
#
# Run from anywhere:
#   powershell -ExecutionPolicy Bypass -File "C:\path\to\rms-next\scripts\start-project.ps1"
# Or from rms-next:
#   .\scripts\start-project.ps1
# With workers:
#   $env:START_WORKERS = "1"; .\scripts\start-project.ps1
# Or:
#   .\scripts\start-project.ps1 --workers

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js is not on PATH. Install Node LTS and reopen the terminal."
}

node (Join-Path (Join-Path $Root "scripts") "start-local.cjs") @args
