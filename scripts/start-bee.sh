#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}/musu-bee" || exit 1
exec ./node_modules/.bin/next dev -p "${MUSU_BEE_PORT:-3001}"
