#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}/musu-bee" || exit 1

# Production: use pre-built .next; fallback to dev if no build
if [ -f .next/BUILD_ID ]; then
  exec ./node_modules/.bin/next start -p "${MUSU_BEE_PORT:-3001}"
else
  echo "[start-bee] no production build, running dev mode"
  exec ./node_modules/.bin/next dev -p "${MUSU_BEE_PORT:-3001}"
fi
