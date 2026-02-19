#!/usr/bin/env bash
# RBM Resource Module - Install Dependencies (Git Bash / Linux / macOS)
# Run from project root: bash install-dependencies.sh   or   ./install-dependencies.sh

set -e
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

echo "=== RBM Resource Module - Installing dependencies ==="
echo "Project root: $PROJECT_ROOT"
echo ""

# --- Backend (Python) ---
echo "[1/2] Backend (Python)..."
BACKEND_DIR="$PROJECT_ROOT/backend"
REQUIREMENTS="$BACKEND_DIR/requirements.txt"

if [ ! -f "$REQUIREMENTS" ]; then
  echo "  ERROR: backend/requirements.txt not found."
  exit 1
fi

if command -v python3 &>/dev/null; then
  PYTHON=python3
  PIP=pip3
elif command -v python &>/dev/null; then
  PYTHON=python
  PIP=pip
else
  echo "  ERROR: Python not found. Install Python 3.11+ and ensure it is in PATH."
  exit 1
fi
echo "  Using: $PYTHON ($($PYTHON --version 2>&1))"

(cd "$BACKEND_DIR" && $PIP install -q --upgrade pip && $PIP install -r requirements.txt)
echo "  Backend dependencies installed."
echo ""

# --- Frontend (Node/npm) ---
echo "[2/2] Frontend (Node/npm)..."
FRONTEND_DIR="$PROJECT_ROOT/rbm-rfm-frontend"
PACKAGE_JSON="$FRONTEND_DIR/package.json"

if [ ! -f "$PACKAGE_JSON" ]; then
  echo "  ERROR: rbm-rfm-frontend/package.json not found."
  exit 1
fi

if ! command -v node &>/dev/null; then
  echo "  ERROR: Node.js not found. Install Node.js (LTS) and ensure it is in PATH."
  exit 1
fi
echo "  Node: $(node -v)  npm: $(npm -v)"

(cd "$FRONTEND_DIR" && npm install)
echo "  Frontend dependencies installed."
echo ""

echo "=== All dependencies installed successfully. ==="
echo "Next steps:"
echo "  - Backend:  cd backend && $PYTHON -m uvicorn main:app --reload"
echo "  - Frontend: cd rbm-rfm-frontend && npm run dev"
echo "  - Copy backend/.env.example to backend/.env and set DB_* and JWT_SECRET_KEY"
