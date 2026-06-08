#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/tss/9router"
PORT="${PORT:-20129}"
HOSTNAME="${HOSTNAME:-0.0.0.0}"
BASE_URL="${BASE_URL:-http://localhost:${PORT}}"
LOG_FILE="${LOG_FILE:-${APP_DIR}/9router.log}"

cd "$APP_DIR"

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
nohup npm run start > "$LOG_FILE" 2>&1 &

PID="$!"
echo "9Router started: http://localhost:${PORT}/dashboard"
echo "PID: ${PID}"
echo "Log: ${LOG_FILE}"
echo "Password: ${INITIAL_PASSWORD:-123456}"
