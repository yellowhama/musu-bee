#!/usr/bin/env bash
# Start musu-bridge with correct PYTHONPATH
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

export PYTHONPATH="${ROOT}/musu-core/src:${ROOT}/musu-bridge:${PYTHONPATH:-}"

cd "${ROOT}/musu-bridge"
exec python3 server.py "$@"
