#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/mcp_banner.sh"

PID_FILE="${PENCIL_PID_FILE:-/tmp/pencil-dev.pid}"
USER_DATA_DIR="${PENCIL_USER_DATA_DIR:-}"

list_main_pids() {
  ps -eo pid=,comm=,args= | awk '
    {
      pid = $1
      comm = tolower($2)
      lower = tolower($0)

      if (comm ~ /^(awk|bash|sh|dash|zsh|fish|rg|grep|sed|head|tail|ps)$/) {
        next
      }
      if (index(lower, "mcp-server-linux-x64") > 0) {
        next
      }
      if (index($0, "--no-sandbox") > 0 &&
          index($0, "--type=") == 0 &&
          (index(lower, "pencil") > 0 || index(lower, "apprun") > 0 || index(lower, "electron") > 0)) {
        print pid
      }
    }
  '
}

pid_matches_scope() {
  local pid="$1"
  local args

  if [[ -z "$pid" ]] || ! ps -p "$pid" >/dev/null 2>&1; then
    return 1
  fi
  if [[ -z "$USER_DATA_DIR" ]]; then
    return 0
  fi

  args="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  [[ "$args" == *"--user-data-dir=$USER_DATA_DIR"* ]]
}

declare -A seen=()
declare -a target_pids=()

add_target_pid() {
  local pid="$1"
  [[ -n "$pid" ]] || return 0
  [[ "$pid" =~ ^[0-9]+$ ]] || return 0
  ps -p "$pid" >/dev/null 2>&1 || return 0
  pid_matches_scope "$pid" || return 0
  if [[ -n "${seen[$pid]:-}" ]]; then
    return 0
  fi
  seen["$pid"]=1
  target_pids+=("$pid")
}

if [[ -f "$PID_FILE" ]]; then
  PID_FROM_FILE="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$PID_FROM_FILE" ]]; then
    add_target_pid "$PID_FROM_FILE"
  fi
else
  echo "[INFO] PID file not found: $PID_FILE"
fi

while IFS= read -r pid; do
  add_target_pid "$pid"
done < <(list_main_pids || true)

if [[ "${#target_pids[@]}" -eq 0 ]]; then
  rm -f "$PID_FILE"
  echo "[INFO] No running Pencil main process found."
  print_mcp_failure_hint
  exit 0
fi

echo "[INFO] Stopping Pencil PID(s): ${target_pids[*]}"
for pid in "${target_pids[@]}"; do
  kill "$pid" >/dev/null 2>&1 || true
done
sleep 1

for pid in "${target_pids[@]}"; do
  if ps -p "$pid" >/dev/null 2>&1; then
    echo "[WARN] PID still running, sending SIGKILL: $pid"
    kill -9 "$pid" >/dev/null 2>&1 || true
  fi
done

rm -f "$PID_FILE"

REMAINING="$(list_main_pids | head -n 1 || true)"
if [[ -n "$REMAINING" ]]; then
  echo "[WARN] Some Pencil process(es) may still be running. First remaining PID: $REMAINING"
  print_mcp_failure_hint
  exit 2
fi

echo "[OK] Stopped"
print_mcp_failure_hint
