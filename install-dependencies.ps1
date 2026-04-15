# RBM Resource Module - Install Dependencies (Windows PowerShell)
# Run from project root: .\install-dependencies.ps1
# Or: powershell -ExecutionPolicy Bypass -File install-dependencies.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot

Write-Host "=== RBM Resource Module - Installing dependencies ===" -ForegroundColor Cyan
Write-Host "Project root: $ProjectRoot`n" -ForegroundColor Gray

# --- App (Node/npm) ---
Write-Host "[1/1] App (Node/npm)..." -ForegroundColor Yellow
$frontendDir = Join-Path $ProjectRoot "rms-next"
$packageJson = Join-Path $frontendDir "package.json"

if (-not (Test-Path $packageJson)) {
    Write-Host "  ERROR: rms-next/package.json not found." -ForegroundColor Red
    exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  ERROR: Node.js not found. Install Node.js (LTS) and ensure it is in PATH." -ForegroundColor Red
    exit 1
}
Write-Host "  Node: $(node -v)  npm: $(npm -v)" -ForegroundColor Gray

Push-Location $frontendDir
try {
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    Write-Host "  Frontend dependencies installed." -ForegroundColor Green
} finally {
    Pop-Location
}

Write-Host "`n=== All dependencies installed successfully. ===" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  - App: cd rms-next && npm run dev" -ForegroundColor Gray
Write-Host "  - Copy rms-next/.env.example to rms-next/.env.local and set DATABASE_URL and JWT_SECRET_KEY" -ForegroundColor Gray
