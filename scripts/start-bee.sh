#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}/musu-bee" || exit 1

# TODO: fix next build error (webpack-runtime TypeError) then switch to next start
exec ./node_modules/.bin/next dev -p "${MUSU_BEE_PORT:-3001}"
