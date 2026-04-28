#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}/musu-bee" || exit 1

# Kill orphan bee process on same port + wait for port to free
_BEE_PORT="${MUSU_BEE_PORT:-3001}"
_OLD=$(lsof -ti:${_BEE_PORT} 2>/dev/null | head -1)
if [ -n "$_OLD" ]; then
  kill "$_OLD" 2>/dev/null; sleep 1
  kill -9 "$_OLD" 2>/dev/null || true
  for _i in $(seq 1 10); do
    lsof -ti:${_BEE_PORT} >/dev/null 2>&1 || break
    sleep 1
  done
fi

# Production: use pre-built .next; rebuild if stale (>7 days) or missing
_BEE_PORT="${MUSU_BEE_PORT:-3001}"
if [ -f .next/BUILD_ID ]; then
  # Check if build is older than 7 days
  _BUILD_AGE=$(( $(date +%s) - $(stat -c %Y .next/BUILD_ID 2>/dev/null || echo 0) ))
  if [ "$_BUILD_AGE" -gt 604800 ]; then
    echo "[start-bee] build older than 7d, rebuilding..."
    ./node_modules/.bin/next build 2>/dev/null || true
  fi
  exec ./node_modules/.bin/next start -p "$_BEE_PORT"
else
  echo "[start-bee] no production build, building..."
  if ./node_modules/.bin/next build 2>/dev/null; then
    exec ./node_modules/.bin/next start -p "$_BEE_PORT"
  else
    echo "[start-bee] build failed, running dev mode"
    exec ./node_modules/.bin/next dev -p "$_BEE_PORT"
  fi
fi
