#!/usr/bin/env bash
set -euo pipefail

RUN_BUILD=false
for arg in "$@"; do
  case "$arg" in
    --build)
      RUN_BUILD=true
      ;;
    -h|--help)
      echo "Usage: $0 [--build]"
      echo "  --build  Run npm install and npm run build before restart"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Usage: $0 [--build]" >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$SCRIPT_DIR}"
PORT="${PORT:-20129}"
BIND_HOST="${BIND_HOST:-0.0.0.0}"
BASE_URL="${BASE_URL:-http://localhost:${PORT}}"
LOG_FILE="${LOG_FILE:-${APP_DIR}/9router.log}"
SERVER_FILE="${APP_DIR}/.next/standalone/server.js"

cd "$APP_DIR"

echo "App dir: ${APP_DIR}"
echo "Bind host: ${BIND_HOST}"
echo "Port: ${PORT}"

if [ "$RUN_BUILD" = true ]; then
  echo "Installing dependencies..."
  npm install

  echo "Building 9Router..."
  PORT="$PORT" \
  HOSTNAME="$BIND_HOST" \
  BASE_URL="$BASE_URL" \
  NEXT_PUBLIC_BASE_URL="$BASE_URL" \
  npm run build
elif [ ! -f "$SERVER_FILE" ]; then
  echo "Missing ${SERVER_FILE}. Run: $0 --build" >&2
  exit 1
fi

if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
else
  PID="$(lsof -ti tcp:"${PORT}" 2>/dev/null || true)"
  if [ -n "$PID" ]; then
    kill $PID || true
  fi
fi

PORT="$PORT" \
HOSTNAME="$BIND_HOST" \
BASE_URL="$BASE_URL" \
NEXT_PUBLIC_BASE_URL="$BASE_URL" \
nohup node "$SERVER_FILE" > "$LOG_FILE" 2>&1 &

PID="$!"
echo "9Router started: http://${BIND_HOST}:${PORT}/dashboard"
echo "PID: ${PID}"
echo "Log: ${LOG_FILE}"
echo "Password: ${INITIAL_PASSWORD:-123456}"
