# RBM Resource Module - Install Dependencies (Windows PowerShell)
# Run from project root: .\install-dependencies.ps1
# Or: powershell -ExecutionPolicy Bypass -File install-dependencies.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot

Write-Host "=== RBM Resource Module - Installing dependencies ===" -ForegroundColor Cyan
Write-Host "Project root: $ProjectRoot`n" -ForegroundColor Gray

# --- Backend (Python) ---
Write-Host "[1/2] Backend (Python)..." -ForegroundColor Yellow
$backendDir = Join-Path $ProjectRoot "backend"
$requirementsPath = Join-Path $backendDir "requirements.txt"

if (-not (Test-Path $requirementsPath)) {
    Write-Host "  ERROR: backend/requirements.txt not found." -ForegroundColor Red
    exit 1
}

$pythonCmd = $null
foreach ($cmd in @("python", "python3", "py -3")) {
    try {
        $v = Invoke-Expression "$cmd --version 2>&1"
        if ($LASTEXITCODE -eq 0 -or $v -match "Python") { $pythonCmd = $cmd; break }
    } catch {}
}
if (-not $pythonCmd) {
    Write-Host "  ERROR: Python not found. Install Python 3.11+ and ensure it is in PATH." -ForegroundColor Red
    exit 1
}
Write-Host "  Using: $pythonCmd" -ForegroundColor Gray

Push-Location $backendDir
try {
    & $pythonCmd -m pip install --upgrade pip -q
    & $pythonCmd -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw "pip install failed" }
    Write-Host "  Backend dependencies installed." -ForegroundColor Green
} finally {
    Pop-Location
}

# --- Frontend (Node/npm) ---
Write-Host "`n[2/2] Frontend (Node/npm)..." -ForegroundColor Yellow
$frontendDir = Join-Path $ProjectRoot "rbm-rfm-frontend"
$packageJson = Join-Path $frontendDir "package.json"

if (-not (Test-Path $packageJson)) {
    Write-Host "  ERROR: rbm-rfm-frontend/package.json not found." -ForegroundColor Red
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
Write-Host "  - Backend:  cd backend && $pythonCmd -m uvicorn main:app --reload" -ForegroundColor Gray
Write-Host "  - Frontend: cd rbm-rfm-frontend && npm run dev" -ForegroundColor Gray
Write-Host "  - Copy backend/.env.example to backend/.env and set DB_* and JWT_SECRET_KEY" -ForegroundColor Gray
