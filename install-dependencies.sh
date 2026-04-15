#!/usr/bin/env bash
# RBM Resource Module - Install Dependencies (Git Bash / Linux / macOS)
# Run from project root: bash install-dependencies.sh   or   ./install-dependencies.sh

set -e
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

echo "=== RBM Resource Module - Installing dependencies ==="
echo "Project root: $PROJECT_ROOT"
echo ""

# --- App (Node/npm) ---
echo "[1/1] App (Node/npm)..."
FRONTEND_DIR="$PROJECT_ROOT/rms-next"
PACKAGE_JSON="$FRONTEND_DIR/package.json"

if [ ! -f "$PACKAGE_JSON" ]; then
  echo "  ERROR: rms-next/package.json not found."
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
echo "  - App: cd rms-next && npm run dev"
echo "  - Copy rms-next/.env.example to rms-next/.env.local and set DATABASE_URL and JWT_SECRET_KEY"
