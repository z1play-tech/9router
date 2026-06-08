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
STANDALONE_DIR="${APP_DIR}/.next/standalone"
SERVER_FILE="${STANDALONE_DIR}/server.js"

cd "$APP_DIR"

echo "App dir: ${APP_DIR}"
echo "Bind host: ${BIND_HOST}"
echo "Port: ${PORT}"

sync_standalone_assets() {
  if [ ! -d "${APP_DIR}/.next/static" ]; then
    echo "Missing ${APP_DIR}/.next/static. Run: $0 --build" >&2
    exit 1
  fi

  mkdir -p "${STANDALONE_DIR}/.next"
  rm -rf "${STANDALONE_DIR}/.next/static"
  cp -R "${APP_DIR}/.next/static" "${STANDALONE_DIR}/.next/static"

  if [ -d "${APP_DIR}/public" ]; then
    rm -rf "${STANDALONE_DIR}/public"
    cp -R "${APP_DIR}/public" "${STANDALONE_DIR}/public"
  fi
}

if [ "$RUN_BUILD" = true ]; then
  echo "Installing dependencies..."
  npm install

  echo "Building 9Router..."
  PORT="$PORT" \
  HOSTNAME="$BIND_HOST" \
  BASE_URL="$BASE_URL" \
  NEXT_PUBLIC_BASE_URL="$BASE_URL" \
  npm run build

  echo "Syncing standalone static assets..."
  sync_standalone_assets
elif [ ! -f "$SERVER_FILE" ]; then
  echo "Missing ${SERVER_FILE}. Run: $0 --build" >&2
  exit 1
elif [ ! -d "${STANDALONE_DIR}/.next/static" ]; then
  echo "Standalone static assets missing. Syncing..."
  sync_standalone_assets
fi

if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
else
  PID="$(lsof -ti tcp:"${PORT}" 2>/dev/null || true)"
  if [ -n "$PID" ]; then
    kill $PID || true
  fi
fi

cd "$STANDALONE_DIR"
PORT="$PORT" \
HOSTNAME="$BIND_HOST" \
BASE_URL="$BASE_URL" \
NEXT_PUBLIC_BASE_URL="$BASE_URL" \
nohup node server.js > "$LOG_FILE" 2>&1 &

PID="$!"
echo "9Router started: http://${BIND_HOST}:${PORT}/dashboard"
echo "PID: ${PID}"
echo "Log: ${LOG_FILE}"
echo "Password: ${INITIAL_PASSWORD:-123456}"
