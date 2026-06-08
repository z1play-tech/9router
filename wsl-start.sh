#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$SCRIPT_DIR}"
PORT="${PORT:-20129}"
HOSTNAME="${HOSTNAME:-0.0.0.0}"
BASE_URL="${BASE_URL:-http://localhost:${PORT}}"
LOG_FILE="${LOG_FILE:-${APP_DIR}/9router.log}"

cd "$APP_DIR"

echo "App dir: ${APP_DIR}"
echo "Installing dependencies..."
npm install

echo "Building 9Router..."
PORT="$PORT" \
HOSTNAME="$HOSTNAME" \
BASE_URL="$BASE_URL" \
NEXT_PUBLIC_BASE_URL="$BASE_URL" \
npm run build

if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
else
  PID="$(lsof -ti tcp:"${PORT}" 2>/dev/null || true)"
  if [ -n "$PID" ]; then
    kill $PID || true
  fi
fi

PORT="$PORT" \
HOSTNAME="$HOSTNAME" \
BASE_URL="$BASE_URL" \
NEXT_PUBLIC_BASE_URL="$BASE_URL" \
nohup npm run start -- --hostname "$HOSTNAME" --port "$PORT" > "$LOG_FILE" 2>&1 &

PID="$!"
echo "9Router started: http://localhost:${PORT}/dashboard"
echo "PID: ${PID}"
echo "Log: ${LOG_FILE}"
echo "Password: ${INITIAL_PASSWORD:-123456}"
