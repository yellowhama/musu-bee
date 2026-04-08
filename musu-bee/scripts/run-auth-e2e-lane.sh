#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 4 ]; then
  echo "usage: $0 <port> <auth_enabled(true|false)> <playwright_config> <test_args...>" >&2
  exit 2
fi

PORT="$1"
AUTH_ENABLED_VALUE="$2"
PLAYWRIGHT_CONFIG="$3"
shift 3

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

SERVER_LOG="${TMPDIR:-/tmp}/musu-next-auth-${PORT}.log"
: > "$SERVER_LOG"

NEXT_PUBLIC_AUTH_ENABLED="$AUTH_ENABLED_VALUE" npx next dev -H 127.0.0.1 -p "$PORT" >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

kill_descendants() {
  local pid="$1"
  local child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_descendants "$child"
    kill -TERM "$child" 2>/dev/null || true
  done
}

cleanup() {
  kill_descendants "$SERVER_PID"
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    kill -TERM "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

READY=0
for _ in $(seq 1 120); do
  if curl -sS --max-time 2 -o /dev/null "http://127.0.0.1:${PORT}"; then
    READY=1
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "next-dev exited before readiness on port ${PORT}" >&2
    tail -n 120 "$SERVER_LOG" >&2 || true
    exit 1
  fi
  sleep 1
done

if [ "$READY" -ne 1 ]; then
  echo "next-dev readiness timeout on port ${PORT}" >&2
  tail -n 120 "$SERVER_LOG" >&2 || true
  exit 1
fi

AUTH_GUARD_E2E_FLAG="0"
if [ "$AUTH_ENABLED_VALUE" = "true" ] || [ "$AUTH_ENABLED_VALUE" = "1" ]; then
  AUTH_GUARD_E2E_FLAG="1"
fi

AUTH_GUARD_E2E="$AUTH_GUARD_E2E_FLAG" npx playwright test "$@" --project=chromium --config="$PLAYWRIGHT_CONFIG" --reporter=list
