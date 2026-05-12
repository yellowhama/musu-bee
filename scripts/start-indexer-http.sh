#!/usr/bin/env bash
# v10-e' — musu-indexer HTTP MCP singleton starter.
#
# Usage:
#   start-indexer-http.sh [PORT]
#
# Defaults to port 9701. Binds to 127.0.0.1 only.
#
# Before starting:
#  1) Forces a SQLite WAL checkpoint on .musu_dev.db so any running stdio
#     indexer's uncommitted work is durably flushed.
#  2) Kills lingering --http child processes on the target port.
#  3) Does NOT touch stdio indexers spawned by other Claude Code sessions
#     — call sites are expected to migrate to the HTTP MCP via mcp-servers.json.
#
# After start:
#  - Listens on 127.0.0.1:PORT/mcp/
#  - Update ~/.claude/mcp-servers.json musu-indexer entry to:
#      {"type":"http","url":"http://127.0.0.1:9701/mcp/"}
#  - Restart Claude Code session to pick up the new config.

set -euo pipefail

PORT="${1:-9701}"
HOST="127.0.0.1"
ROOT="${MUSU_FUNCTIONS_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
INDEXER_BIN="${ROOT}/musu-indexer/.venv/bin/musu-indexer"
DB_PATH="${ROOT}/.musu_dev.db"
LOG_DIR="${ROOT}/logs"
LOG_FILE="${LOG_DIR}/musu-indexer-http.log"
PID_FILE="${ROOT}/.musu_dev.indexer-http.pid"

mkdir -p "$LOG_DIR"

if [[ ! -x "$INDEXER_BIN" ]]; then
  echo "[indexer-http] FATAL: $INDEXER_BIN not executable" >&2
  exit 1
fi

# 1) WAL checkpoint — flush uncommitted work from any running stdio indexer.
if [[ -f "$DB_PATH" ]]; then
  echo "[indexer-http] WAL checkpoint on $DB_PATH" >&2
  sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);" 2>&1 | tail -3 || true
fi

# 2) Kill any existing --http indexer on the target port.
existing_pid="$(ss -tlnp 2>/dev/null | awk -v port=":$PORT " '$0 ~ port {match($0, /pid=([0-9]+)/, a); print a[1]; exit}')"
if [[ -n "$existing_pid" ]]; then
  echo "[indexer-http] killing existing HTTP listener PID=$existing_pid on port $PORT" >&2
  kill "$existing_pid" 2>/dev/null || true
  sleep 2
  kill -9 "$existing_pid" 2>/dev/null || true
fi

# 3) Spawn HTTP MCP.
echo "[indexer-http] spawning $INDEXER_BIN mcp --http --host $HOST --port $PORT" >&2
nohup "$INDEXER_BIN" mcp --http --host "$HOST" --port "$PORT" >> "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"
disown

# 4) Sanity wait + listen check.
sleep 3
if ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
  echo "[indexer-http] OK — PID=$NEW_PID listening on http://$HOST:$PORT/mcp/" >&2
  exit 0
else
  echo "[indexer-http] FAIL — no listener on port $PORT after 3s. See $LOG_FILE" >&2
  tail -20 "$LOG_FILE" >&2 || true
  exit 1
fi
