#!/usr/bin/env bash
# V24 R-fast dual-start (wiki/491 §6.1)
#
# Launches Python musu-bridge on :8071 (loopback-only) as the facade
# target, then launches Rust musu-rs on :8070 as the operator's primary
# entry. Enforces C-SEC-3 invariant: Python on :8071 binds 127.0.0.1 only.
#
# Usage:
#   export MUSU_BRIDGE_TOKEN=$(head -c 24 /dev/urandom | base64)
#   scripts/v24-rfast-dual-start.sh
#
# Operator visits musu-bee at http://localhost:1355 with
# BRIDGE_URL=http://127.0.0.1:8070

set -euo pipefail

if [[ -z "${MUSU_BRIDGE_TOKEN:-}" ]]; then
  echo "ERROR: MUSU_BRIDGE_TOKEN must be set (≥32 chars recommended)" >&2
  exit 1
fi

# Pre-flight: detect existing :8070 / :8071 binding (Linux/WSL).
# On macOS, `ss` is unavailable — fall back to `lsof`. On Windows users
# should use WSL or PowerShell adapter.
port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -tln "sport = :$port" 2>/dev/null | grep -q LISTEN
  elif command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  else
    return 1
  fi
}

if port_in_use 8070; then
  echo "ERROR: port 8070 already in use" >&2
  exit 1
fi
if port_in_use 8071; then
  echo "ERROR: port 8071 already in use" >&2
  exit 1
fi

# C-SEC-3 invariant: Python on :8071 binds 127.0.0.1 ONLY.
# Python-side guard (server.py §6.1 edit) refuses to boot if BRIDGE_HOST
# is anything else when MUSU_V24_FACADE_TARGET=1.
export BRIDGE_HOST=127.0.0.1
export BRIDGE_PORT=8071
export MUSU_V24_FACADE_TARGET=1

# Locate the musu-rs binary. Prefer release, fall back to debug.
RUST_BIN=""
for candidate in \
  "$(dirname "$0")/../musu-rs/target/release/musu" \
  "$(dirname "$0")/../musu-rs/target/release/musu.exe" \
  "$(dirname "$0")/../musu-rs/target/debug/musu" \
  "$(dirname "$0")/../musu-rs/target/debug/musu.exe"
do
  if [[ -x "$candidate" ]]; then
    RUST_BIN="$candidate"
    break
  fi
done
if [[ -z "$RUST_BIN" ]]; then
  echo "ERROR: musu-rs binary not found. Run \`cargo build --release\` in musu-rs/ first." >&2
  exit 1
fi

# Start Python facade target in background.
cd "$(dirname "$0")/.."
python -m uvicorn musu_bridge.server:app \
  --host 127.0.0.1 --port 8071 \
  --log-level info &
PY_PID=$!

trap 'kill $PY_PID 2>/dev/null || true' EXIT

# Wait for Python health (up to 30s).
for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:8071/health >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Start Rust (foreground; signals propagate via trap).
MUSU_PYTHON_BRIDGE_PORT=8071 exec "$RUST_BIN" bridge
