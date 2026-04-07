#!/bin/bash
set -euo pipefail

ROOT="/home/hugh51/.local/share/codex-mcp/rootless-computer-control"
HELPER="$ROOT/scrot-helper.sh"
SERVER="$ROOT/server.py"
PYTHON="/mnt/wslg/distro/usr/bin/python3"
REQUEST_DIR="$ROOT/helper-requests"
HELPER_LOG="/tmp/computer-control-scrot-helper.log"

mkdir -p "$REQUEST_DIR"
rm -f "$REQUEST_DIR"/*.req "$REQUEST_DIR"/*.res

"$HELPER" >"$HELPER_LOG" 2>&1 &
helper_pid=$!

cleanup() {
  kill "$helper_pid" >/dev/null 2>&1 || true
  wait "$helper_pid" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

"$PYTHON" "$SERVER"
