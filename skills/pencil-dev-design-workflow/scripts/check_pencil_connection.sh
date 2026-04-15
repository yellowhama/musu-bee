#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/mcp_banner.sh"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 /absolute/path/to/file.pen [log_file]"
  exit 1
fi

PEN_FILE="$1"
WINDOW_LINES="${WINDOW_LINES:-3000}"
PID_FILE="${PENCIL_PID_FILE:-/tmp/pencil-dev.pid}"
USER_DATA_DIR="${PENCIL_USER_DATA_DIR:-}"
REQUIRE_INITIALIZED="${PENCIL_REQUIRE_INITIALIZED:-0}"
DEFAULT_LOG_FILE="/home/hugh51/.config/Pencil/logs/main.log"
if [[ -n "$USER_DATA_DIR" ]]; then
  DEFAULT_LOG_FILE="$USER_DATA_DIR/logs/main.log"
fi
LOG_FILE="${2:-${PENCIL_MAIN_LOG:-$DEFAULT_LOG_FILE}}"

if ! [[ "$WINDOW_LINES" =~ ^[0-9]+$ ]] || [[ "$WINDOW_LINES" -lt 100 ]]; then
  WINDOW_LINES=3000
fi
if ! [[ "$REQUIRE_INITIALIZED" =~ ^[0-9]+$ ]]; then
  REQUIRE_INITIALIZED=0
fi
if [[ "$REQUIRE_INITIALIZED" -ne 0 ]]; then
  REQUIRE_INITIALIZED=1
fi

if [[ ! -f "$LOG_FILE" ]]; then
  echo "[ERROR] Log file not found: $LOG_FILE"
  exit 1
fi

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

extract_pen_from_args() {
  local args="$1"
  printf '%s\n' "$args" | awk '
    {
      pen = ""
      for (i = 1; i <= NF; i++) {
        if ($i ~ /\.pen$/) {
          pen = $i
        }
      }
      if (pen != "") {
        print pen
      }
    }
  '
}

RUNNING_PID=""
declare -a SCOPED_PIDS=()
main_process_total=0
main_process_target_count=0
main_process_non_target_count=0
main_process_unknown_count=0
while IFS= read -r pid; do
  [[ -n "$pid" ]] || continue
  args="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  active_pen="$(extract_pen_from_args "$args" || true)"
  main_process_total=$((main_process_total + 1))
  if [[ -n "$active_pen" ]]; then
    if [[ "$active_pen" == "$PEN_FILE" ]]; then
      main_process_target_count=$((main_process_target_count + 1))
    else
      main_process_non_target_count=$((main_process_non_target_count + 1))
    fi
  else
    main_process_unknown_count=$((main_process_unknown_count + 1))
  fi

  if pid_matches_scope "$pid"; then
    SCOPED_PIDS+=("$pid")
    RUNNING_PID="$pid"
  fi
done < <(list_main_pids || true)

has_running=0
if [[ "${#SCOPED_PIDS[@]}" -gt 0 ]]; then
  has_running=1
fi

LOG_WINDOW="$(tail -n "$WINDOW_LINES" "$LOG_FILE")"

has_load=0
has_resource=0
has_init=0
has_claude=0
has_codex=0
latest_load_is_target=0
latest_resource_is_target=0
latest_init_is_target=0
last_load=""
last_resource=""
last_init=""
last_claude=""
last_codex=""
last_load_any=""
last_resource_any=""
last_init_any=""
init_ok=1

if printf '%s\n' "$LOG_WINDOW" | grep -F "loadFile $PEN_FILE" >/dev/null; then
  has_load=1
  last_load="$(printf '%s\n' "$LOG_WINDOW" | grep -nF "loadFile $PEN_FILE" | tail -n 1 || true)"
fi
if printf '%s\n' "$LOG_WINDOW" | grep -F "addResource: $PEN_FILE" >/dev/null; then
  has_resource=1
  last_resource="$(printf '%s\n' "$LOG_WINDOW" | grep -nF "addResource: $PEN_FILE" | tail -n 1 || true)"
fi
if printf '%s\n' "$LOG_WINDOW" | grep -F "[IPC] initialized: $PEN_FILE" >/dev/null; then
  has_init=1
  last_init="$(printf '%s\n' "$LOG_WINDOW" | grep -nF "[IPC] initialized: $PEN_FILE" | tail -n 1 || true)"
fi
last_load_any="$(printf '%s\n' "$LOG_WINDOW" | grep -nF "loadFile " | tail -n 1 || true)"
last_resource_any="$(printf '%s\n' "$LOG_WINDOW" | grep -nF "addResource: " | tail -n 1 || true)"
last_init_any="$(printf '%s\n' "$LOG_WINDOW" | grep -nF "[IPC] initialized: " | tail -n 1 || true)"
if [[ -n "$last_load_any" && "$last_load_any" == *"loadFile $PEN_FILE"* ]]; then
  latest_load_is_target=1
fi
if [[ -n "$last_resource_any" && "$last_resource_any" == *"addResource: $PEN_FILE"* ]]; then
  latest_resource_is_target=1
fi
if [[ -n "$last_init_any" && "$last_init_any" == *"[IPC] initialized: $PEN_FILE"* ]]; then
  latest_init_is_target=1
fi
if printf '%s\n' "$LOG_WINDOW" | grep -F "Sending notification: claude-status" >/dev/null; then
  has_claude=1
  last_claude="$(printf '%s\n' "$LOG_WINDOW" | grep -nF "Sending notification: claude-status" | tail -n 1 || true)"
fi
if printf '%s\n' "$LOG_WINDOW" | grep -F "Sending notification: codex-status" >/dev/null; then
  has_codex=1
  last_codex="$(printf '%s\n' "$LOG_WINDOW" | grep -nF "Sending notification: codex-status" | tail -n 1 || true)"
fi

if [[ "$REQUIRE_INITIALIZED" -eq 1 && "$has_init" -ne 1 ]]; then
  init_ok=0
fi
if [[ "$has_init" -eq 1 && "$latest_init_is_target" -ne 1 ]]; then
  init_ok=0
fi

echo "[INFO] Log: $LOG_FILE"
echo "[INFO] Window lines: $WINDOW_LINES"
echo "[INFO] PID file: $PID_FILE"
echo "[INFO] Target pen: $PEN_FILE"
echo
echo "[CHECK] process-running: $has_running"
if [[ "$has_running" -eq 1 ]]; then
  echo "[CHECK] process-pid: $RUNNING_PID"
else
  echo "[CHECK] process-pid: none"
fi
echo "[CHECK] scoped-main-count: ${#SCOPED_PIDS[@]}"
echo "[CHECK] main-process-total: $main_process_total"
echo "[CHECK] main-process-target-count: $main_process_target_count"
echo "[CHECK] main-process-non-target-count: $main_process_non_target_count"
echo "[CHECK] main-process-unknown-target-count: $main_process_unknown_count"
echo "[CHECK] loadFile: $has_load"
echo "[CHECK] addResource: $has_resource"
echo "[CHECK] initialized: $has_init"
echo "[CHECK] latest-loadFile-is-target: $latest_load_is_target"
echo "[CHECK] latest-addResource-is-target: $latest_resource_is_target"
echo "[CHECK] latest-initialized-is-target: $latest_init_is_target"
echo "[CHECK] initialized-required: $REQUIRE_INITIALIZED"
echo "[CHECK] claude-status: $has_claude"
echo "[CHECK] codex-status: $has_codex"
echo
echo "[INFO] Recent matching lines:"
printf '%s\n' "$LOG_WINDOW" \
  | grep -nE "loadFile |addResource: |\\[IPC\\] initialized: |Sending notification: claude-status|Sending notification: codex-status" \
  | tail -n 40 || true

echo
echo "[INFO] Last marker positions:"
echo "  loadFile: ${last_load:-missing}"
echo "  addResource: ${last_resource:-missing}"
echo "  initialized: ${last_init:-missing}"
echo "  last loadFile(any): ${last_load_any:-missing}"
echo "  last addResource(any): ${last_resource_any:-missing}"
echo "  last initialized(any): ${last_init_any:-missing}"
echo "  claude-status: ${last_claude:-missing}"
echo "  codex-status: ${last_codex:-missing}"

if [[ "$has_running" -eq 1 && "$main_process_non_target_count" -eq 0 && "$main_process_unknown_count" -eq 0 && "$has_load" -eq 1 && "$has_resource" -eq 1 && "$latest_load_is_target" -eq 1 && "$latest_resource_is_target" -eq 1 && "$init_ok" -eq 1 ]]; then
  echo
  echo "[OK] Pencil process is running and connection markers are present."
  print_mcp_banner
  exit 0
fi

echo
if [[ "$main_process_non_target_count" -gt 0 || "$main_process_unknown_count" -gt 0 ]]; then
  echo "[WARN] Non-target or unknown Pencil main process detected during check window."
  echo "[WARN] non_target=$main_process_non_target_count unknown_target=$main_process_unknown_count"
  print_mcp_failure_hint
  exit 4
fi

if [[ "$has_running" -ne 1 ]]; then
  echo "[WARN] Pencil process is not running (stale log markers may exist)."
  print_mcp_failure_hint
  exit 3
fi

if [[ "$has_load" -eq 1 || "$has_resource" -eq 1 || "$has_init" -eq 1 ]]; then
  if [[ "$latest_load_is_target" -ne 1 || "$latest_resource_is_target" -ne 1 || "$init_ok" -ne 1 ]]; then
    echo "[WARN] Target markers exist, but latest runtime markers point to a different .pen file."
    print_mcp_failure_hint
    exit 4
  fi
fi

echo "[WARN] One or more connection markers are missing."
print_mcp_failure_hint
exit 2
