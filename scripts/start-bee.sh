#!/usr/bin/env bash
# Start musu-bee frontend
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

cd "${ROOT}/musu-bee"
exec pnpm dev --port "${BEE_PORT:-3001}" --hostname "${BEE_HOST:-0.0.0.0}" "$@"
