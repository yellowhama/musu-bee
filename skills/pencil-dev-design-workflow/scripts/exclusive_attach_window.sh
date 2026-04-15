#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 /absolute/path/to/file.pen [artifact_dir]"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/mcp_banner.sh"

PEN_FILE="$1"
if [[ ! -f "$PEN_FILE" ]]; then
  echo "[ERROR] .pen file not found: $PEN_FILE"
  exit 1
fi

ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
STAMP="$(date +%Y%m%dT%H%M%S%z)"
ARTIFACT_DIR="${2:-$ROOT_DIR/artifacts/mus1817-lock-${STAMP}}"
POLICY="${PENCIL_EXCLUSIVE_POLICY:-force_clean}"
WINDOW_LINES="${WINDOW_LINES:-5000}"
TAIL_LINES="${TAIL_LINES:-260}"
WARMUP_MAX_SECONDS="${WARMUP_MAX_SECONDS:-20}"
REQUIRE_INITIALIZED="${PENCIL_REQUIRE_INITIALIZED:-1}"
PID_FILE="${PENCIL_PID_FILE:-/tmp/pencil-dev.pid}"
RUNTIME_LOG="${PENCIL_LOG_FILE:-/tmp/pencil-dev.log}"
PROFILE_DIR="${PENCIL_USER_DATA_DIR:-$ARTIFACT_DIR/profile}"
GLOBAL_MAIN_LOG="${PENCIL_MAIN_LOG:-/home/hugh51/.config/Pencil/logs/main.log}"
MAIN_LOG="$PROFILE_DIR/logs/main.log"
NON_TARGET_GUARD_PEN="${PENCIL_NON_TARGET_GUARD_PEN:-$ROOT_DIR/artifacts/mus1783-work-hub-remediation.pen}"
FORCE_PRODUCTION_MODE="${PENCIL_FORCE_PRODUCTION_MODE:-1}"
MCP_TIMEOUT_SECONDS="${PENCIL_MCP_TIMEOUT_SECONDS:-20}"

if ! [[ "$WINDOW_LINES" =~ ^[0-9]+$ ]] || [[ "$WINDOW_LINES" -lt 100 ]]; then
  WINDOW_LINES=5000
fi
if ! [[ "$TAIL_LINES" =~ ^[0-9]+$ ]] || [[ "$TAIL_LINES" -lt 50 ]]; then
  TAIL_LINES=260
fi
if ! [[ "$WARMUP_MAX_SECONDS" =~ ^[0-9]+$ ]] || [[ "$WARMUP_MAX_SECONDS" -lt 0 ]]; then
  WARMUP_MAX_SECONDS=20
fi
if ! [[ "$REQUIRE_INITIALIZED" =~ ^[0-9]+$ ]]; then
  REQUIRE_INITIALIZED=1
fi
if [[ "$REQUIRE_INITIALIZED" -ne 0 ]]; then
  REQUIRE_INITIALIZED=1
fi
if ! [[ "$FORCE_PRODUCTION_MODE" =~ ^[0-9]+$ ]]; then
  FORCE_PRODUCTION_MODE=1
fi
if [[ "$FORCE_PRODUCTION_MODE" -ne 0 ]]; then
  FORCE_PRODUCTION_MODE=1
fi
if ! [[ "$MCP_TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] || [[ "$MCP_TIMEOUT_SECONDS" -lt 1 ]]; then
  MCP_TIMEOUT_SECONDS=20
fi

# Default to per-artifact runtime files so concurrent evidence windows do not
# race on global /tmp paths.
if [[ "${PENCIL_PID_FILE:-}" == "" ]]; then
  PID_FILE="$ARTIFACT_DIR/runtime/pencil-dev.pid"
fi
if [[ "${PENCIL_LOG_FILE:-}" == "" ]]; then
  RUNTIME_LOG="$ARTIFACT_DIR/runtime/pencil-dev.log"
fi

mkdir -p \
  "$ARTIFACT_DIR" \
  "$ARTIFACT_DIR/checks" \
  "$ARTIFACT_DIR/mcp" \
  "$ARTIFACT_DIR/process" \
  "$ARTIFACT_DIR/runtime" \
  "$ARTIFACT_DIR/logs" \
  "$PROFILE_DIR"
mkdir -p "$(dirname "$PID_FILE")" "$(dirname "$RUNTIME_LOG")"

COMMANDS_FILE="$ARTIFACT_DIR/commands.txt"
CHECK_DIR="$ARTIFACT_DIR/checks"
PROCESS_DIR="$ARTIFACT_DIR/process"
MCP_DIR="$ARTIFACT_DIR/mcp"
LOG_DIR="$ARTIFACT_DIR/logs"
EXIT_FILE="$CHECK_DIR/exit_codes.txt"

: >"$COMMANDS_FILE"
: >"$EXIT_FILE"

write_cmd() {
  local command="$1"
  printf '%s\n' "$command" >>"$COMMANDS_FILE"
}

write_exit() {
  local key="$1"
  local value="$2"
  printf '%s=%s\n' "$key" "$value" >>"$EXIT_FILE"
}

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

snapshot_processes() {
  local phase="$1"
  local outfile="$2"
  local scoped_count=0
  local main_total_count=0
  local target_main_count=0
  local non_target_main_count=0
  local unknown_target_main_count=0
  {
    echo "phase=$phase"
    echo "timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "target_pen=$PEN_FILE"
    echo "profile_dir=$PROFILE_DIR"
    echo "pid_file=$PID_FILE"
    echo "main_log=$MAIN_LOG"
    echo "runtime_log=$RUNTIME_LOG"
    echo "window_lines=$WINDOW_LINES"
    echo "policy=$POLICY"
    echo
    echo "[all_main_processes]"
    while IFS= read -r pid; do
      local args
      local active_pen
      args="$(ps -p "$pid" -o args= 2>/dev/null || true)"
      active_pen="$(extract_pen_from_args "$args" || true)"
      printf 'pid=%s active_pen=%s args=%s\n' "$pid" "${active_pen:-unknown}" "$args"
      main_total_count=$((main_total_count + 1))
      if [[ -n "$active_pen" ]]; then
        if [[ "$active_pen" == "$PEN_FILE" ]]; then
          target_main_count=$((target_main_count + 1))
        else
          non_target_main_count=$((non_target_main_count + 1))
        fi
      else
        unknown_target_main_count=$((unknown_target_main_count + 1))
      fi
      if [[ "$args" == *"--user-data-dir=$PROFILE_DIR"* ]]; then
        scoped_count=$((scoped_count + 1))
      fi
    done < <(list_main_pids || true)
    echo
    echo "scoped_main_count=$scoped_count"
    echo "main_total_count=$main_total_count"
    echo "target_main_count=$target_main_count"
    echo "non_target_main_count=$non_target_main_count"
    echo "unknown_target_main_count=$unknown_target_main_count"
    echo
  } >"$outfile"
}

force_kill_leftovers() {
  local leftover
  while IFS= read -r leftover; do
    [[ -n "$leftover" ]] || continue
    kill -9 "$leftover" >/dev/null 2>&1 || true
  done < <(list_main_pids || true)
}

scoped_main_count() {
  local count=0
  while IFS= read -r pid; do
    local args
    args="$(ps -p "$pid" -o args= 2>/dev/null || true)"
    if [[ "$args" == *"--user-data-dir=$PROFILE_DIR"* ]]; then
      if [[ "$args" != *".AppImage"* ]]; then
        count=$((count + 1))
      fi
    fi
  done < <(list_main_pids || true)
  echo "$count"
}

main_target_count() {
  local count=0
  while IFS= read -r pid; do
    local args
    local active_pen
    args="$(ps -p "$pid" -o args= 2>/dev/null || true)"
    active_pen="$(extract_pen_from_args "$args" || true)"
    if [[ -n "$active_pen" && "$active_pen" == "$PEN_FILE" ]]; then
      count=$((count + 1))
    fi
  done < <(list_main_pids || true)
  echo "$count"
}

main_non_target_count() {
  local count=0
  while IFS= read -r pid; do
    local args
    local active_pen
    args="$(ps -p "$pid" -o args= 2>/dev/null || true)"
    active_pen="$(extract_pen_from_args "$args" || true)"
    if [[ -n "$active_pen" && "$active_pen" != "$PEN_FILE" ]]; then
      count=$((count + 1))
    fi
  done < <(list_main_pids || true)
  echo "$count"
}

main_unknown_target_count() {
  local count=0
  while IFS= read -r pid; do
    local args
    local active_pen
    args="$(ps -p "$pid" -o args= 2>/dev/null || true)"
    active_pen="$(extract_pen_from_args "$args" || true)"
    if [[ -z "$active_pen" ]]; then
      count=$((count + 1))
    fi
  done < <(list_main_pids || true)
  echo "$count"
}

main_specific_pen_count() {
  local expected_pen="$1"
  local count=0
  while IFS= read -r pid; do
    local args
    local active_pen
    args="$(ps -p "$pid" -o args= 2>/dev/null || true)"
    active_pen="$(extract_pen_from_args "$args" || true)"
    if [[ -n "$active_pen" && "$active_pen" == "$expected_pen" ]]; then
      count=$((count + 1))
    fi
  done < <(list_main_pids || true)
  echo "$count"
}

resolve_main_log() {
  local scoped="$PROFILE_DIR/logs/main.log"
  if [[ -f "$scoped" ]]; then
    echo "$scoped"
    return 0
  fi
  if [[ -f "$GLOBAL_MAIN_LOG" ]]; then
    echo "$GLOBAL_MAIN_LOG"
    return 0
  fi
  echo "$scoped"
}

run_and_capture() {
  local label="$1"
  local outfile="$2"
  shift 2

  write_cmd "$label"
  set +e
  "$@" >"$outfile" 2>&1
  local rc=$?
  set -e
  echo "$rc"
}

run_mcp_cmd() {
  local outfile="$1"
  shift

  if command -v timeout >/dev/null 2>&1; then
    timeout "${MCP_TIMEOUT_SECONDS}s" "$@" >"$outfile" 2>&1
  else
    "$@" >"$outfile" 2>&1
  fi
}

echo "started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >>"$EXIT_FILE"
echo "artifact_dir=$ARTIFACT_DIR" >>"$EXIT_FILE"
echo "policy=$POLICY" >>"$EXIT_FILE"
echo "target_pen=$PEN_FILE" >>"$EXIT_FILE"
echo "profile_dir=$PROFILE_DIR" >>"$EXIT_FILE"
echo "main_log=$MAIN_LOG" >>"$EXIT_FILE"
echo "global_main_log=$GLOBAL_MAIN_LOG" >>"$EXIT_FILE"
echo "runtime_log=$RUNTIME_LOG" >>"$EXIT_FILE"
echo "window_lines=$WINDOW_LINES" >>"$EXIT_FILE"
echo "warmup_max_seconds=$WARMUP_MAX_SECONDS" >>"$EXIT_FILE"
echo "require_initialized=$REQUIRE_INITIALIZED" >>"$EXIT_FILE"
echo "force_production_mode=$FORCE_PRODUCTION_MODE" >>"$EXIT_FILE"
echo "guardrail_non_target_pen=$NON_TARGET_GUARD_PEN" >>"$EXIT_FILE"

write_cmd "snapshot_processes before -> $PROCESS_DIR/pre.txt"
snapshot_processes "before" "$PROCESS_DIR/pre.txt"

STOP_RC="$(run_and_capture "$SCRIPT_DIR/stop_pencil_dev.sh" "$PROCESS_DIR/stop.log" "$SCRIPT_DIR/stop_pencil_dev.sh")"
write_exit "stop" "$STOP_RC"

write_cmd "force_kill_leftovers (pencil main processes)"
force_kill_leftovers

write_cmd "snapshot_processes post_kill -> $PROCESS_DIR/post_kill.txt"
snapshot_processes "post_kill" "$PROCESS_DIR/post_kill.txt"

START_RC="$(run_and_capture "PENCIL_EXCLUSIVE_POLICY=$POLICY PENCIL_FORCE_LAUNCH=1 PENCIL_FORCE_PRODUCTION_MODE=$FORCE_PRODUCTION_MODE PENCIL_USER_DATA_DIR=$PROFILE_DIR PENCIL_PID_FILE=$PID_FILE PENCIL_LOG_FILE=$RUNTIME_LOG $SCRIPT_DIR/start_pencil_dev.sh $PEN_FILE" "$CHECK_DIR/start.log" env PENCIL_EXCLUSIVE_POLICY="$POLICY" PENCIL_FORCE_LAUNCH=1 PENCIL_FORCE_PRODUCTION_MODE="$FORCE_PRODUCTION_MODE" PENCIL_USER_DATA_DIR="$PROFILE_DIR" PENCIL_PID_FILE="$PID_FILE" PENCIL_LOG_FILE="$RUNTIME_LOG" "$SCRIPT_DIR/start_pencil_dev.sh" "$PEN_FILE")"
write_exit "start" "$START_RC"

write_cmd "snapshot_processes post_launch -> $PROCESS_DIR/post_launch.txt"
snapshot_processes "post_launch" "$PROCESS_DIR/post_launch.txt"

SCOPED_MAIN_COUNT="-1"
TARGET_MAIN_COUNT="-1"
NON_TARGET_MAIN_COUNT="-1"
UNKNOWN_TARGET_MAIN_COUNT="-1"
GUARD_POST_LAUNCH_NON_TARGET_COUNT="-1"
if [[ "$START_RC" -eq 0 ]]; then
  SCOPED_MAIN_COUNT="$(scoped_main_count)"
  TARGET_MAIN_COUNT="$(main_target_count)"
  NON_TARGET_MAIN_COUNT="$(main_non_target_count)"
  UNKNOWN_TARGET_MAIN_COUNT="$(main_unknown_target_count)"
  GUARD_POST_LAUNCH_NON_TARGET_COUNT="$(main_specific_pen_count "$NON_TARGET_GUARD_PEN")"
  MAIN_LOG="$(resolve_main_log)"
fi
write_exit "main_log_selected" "$MAIN_LOG"
write_exit "scoped_main_count" "$SCOPED_MAIN_COUNT"
write_exit "target_main_count" "$TARGET_MAIN_COUNT"
write_exit "non_target_main_count" "$NON_TARGET_MAIN_COUNT"
write_exit "unknown_target_main_count" "$UNKNOWN_TARGET_MAIN_COUNT"
write_exit "guardrail_post_launch_non_target_process_count" "$GUARD_POST_LAUNCH_NON_TARGET_COUNT"

A1_LEGACY_RC=1
if [[ "$SCOPED_MAIN_COUNT" == "1" ]]; then
  A1_LEGACY_RC=0
fi
write_exit "a1_exactly_one_scoped_main" "$A1_LEGACY_RC"

A1_RC=1
if [[ "$TARGET_MAIN_COUNT" -ge 1 && "$NON_TARGET_MAIN_COUNT" -eq 0 && "$UNKNOWN_TARGET_MAIN_COUNT" -eq 0 ]]; then
  A1_RC=0
fi
write_exit "a1_target_only_main_session" "$A1_RC"

CHECK1_RC=125
CHECK2_RC=125
CHECK3_RC=125
WARMUP_RC=125
A3_1_LOAD=0
A3_1_ADD=0
A3_2_LOAD=0
A3_2_ADD=0
A3_3_LOAD=0
A3_3_ADD=0
GUARD_01_LAST_LOAD_NON_TARGET=0
GUARD_01_LAST_ADD_NON_TARGET=0
GUARD_01_LAST_INIT_NON_TARGET=0
GUARD_02_LAST_LOAD_NON_TARGET=0
GUARD_02_LAST_ADD_NON_TARGET=0
GUARD_02_LAST_INIT_NON_TARGET=0
GUARD_03_LAST_LOAD_NON_TARGET=0
GUARD_03_LAST_ADD_NON_TARGET=0
GUARD_03_LAST_INIT_NON_TARGET=0

if [[ "$START_RC" -eq 0 ]]; then
  WARMUP_RC=1
  write_cmd "warmup: wait up to $WARMUP_MAX_SECONDS seconds for target markers"
  for second in $(seq 0 "$WARMUP_MAX_SECONDS"); do
    WARMUP_RC="$(run_and_capture "WINDOW_LINES=$WINDOW_LINES PENCIL_REQUIRE_INITIALIZED=$REQUIRE_INITIALIZED PENCIL_USER_DATA_DIR=$PROFILE_DIR PENCIL_PID_FILE=$PID_FILE $SCRIPT_DIR/check_pencil_connection.sh $PEN_FILE $MAIN_LOG > checks/warmup.log" "$CHECK_DIR/warmup.log" env WINDOW_LINES="$WINDOW_LINES" PENCIL_REQUIRE_INITIALIZED="$REQUIRE_INITIALIZED" PENCIL_USER_DATA_DIR="$PROFILE_DIR" PENCIL_PID_FILE="$PID_FILE" "$SCRIPT_DIR/check_pencil_connection.sh" "$PEN_FILE" "$MAIN_LOG")"
    if [[ "$WARMUP_RC" -eq 0 ]]; then
      break
    fi
    if [[ "$second" -lt "$WARMUP_MAX_SECONDS" ]]; then
      sleep 1
    fi
  done

  CHECK1_RC="$(run_and_capture "WINDOW_LINES=$WINDOW_LINES PENCIL_REQUIRE_INITIALIZED=$REQUIRE_INITIALIZED PENCIL_USER_DATA_DIR=$PROFILE_DIR PENCIL_PID_FILE=$PID_FILE $SCRIPT_DIR/check_pencil_connection.sh $PEN_FILE $MAIN_LOG > checks/01.log" "$CHECK_DIR/01.log" env WINDOW_LINES="$WINDOW_LINES" PENCIL_REQUIRE_INITIALIZED="$REQUIRE_INITIALIZED" PENCIL_USER_DATA_DIR="$PROFILE_DIR" PENCIL_PID_FILE="$PID_FILE" "$SCRIPT_DIR/check_pencil_connection.sh" "$PEN_FILE" "$MAIN_LOG")"
  sleep 1
  CHECK2_RC="$(run_and_capture "WINDOW_LINES=$WINDOW_LINES PENCIL_REQUIRE_INITIALIZED=$REQUIRE_INITIALIZED PENCIL_USER_DATA_DIR=$PROFILE_DIR PENCIL_PID_FILE=$PID_FILE $SCRIPT_DIR/check_pencil_connection.sh $PEN_FILE $MAIN_LOG > checks/02.log" "$CHECK_DIR/02.log" env WINDOW_LINES="$WINDOW_LINES" PENCIL_REQUIRE_INITIALIZED="$REQUIRE_INITIALIZED" PENCIL_USER_DATA_DIR="$PROFILE_DIR" PENCIL_PID_FILE="$PID_FILE" "$SCRIPT_DIR/check_pencil_connection.sh" "$PEN_FILE" "$MAIN_LOG")"
  sleep 1
  CHECK3_RC="$(run_and_capture "WINDOW_LINES=$WINDOW_LINES PENCIL_REQUIRE_INITIALIZED=$REQUIRE_INITIALIZED PENCIL_USER_DATA_DIR=$PROFILE_DIR PENCIL_PID_FILE=$PID_FILE $SCRIPT_DIR/check_pencil_connection.sh $PEN_FILE $MAIN_LOG > checks/03.log" "$CHECK_DIR/03.log" env WINDOW_LINES="$WINDOW_LINES" PENCIL_REQUIRE_INITIALIZED="$REQUIRE_INITIALIZED" PENCIL_USER_DATA_DIR="$PROFILE_DIR" PENCIL_PID_FILE="$PID_FILE" "$SCRIPT_DIR/check_pencil_connection.sh" "$PEN_FILE" "$MAIN_LOG")"

  if grep -Fq "[CHECK] latest-loadFile-is-target: 1" "$CHECK_DIR/01.log"; then A3_1_LOAD=1; fi
  if grep -Fq "[CHECK] latest-addResource-is-target: 1" "$CHECK_DIR/01.log"; then A3_1_ADD=1; fi
  if grep -Fq "[CHECK] latest-loadFile-is-target: 1" "$CHECK_DIR/02.log"; then A3_2_LOAD=1; fi
  if grep -Fq "[CHECK] latest-addResource-is-target: 1" "$CHECK_DIR/02.log"; then A3_2_ADD=1; fi
  if grep -Fq "[CHECK] latest-loadFile-is-target: 1" "$CHECK_DIR/03.log"; then A3_3_LOAD=1; fi
  if grep -Fq "[CHECK] latest-addResource-is-target: 1" "$CHECK_DIR/03.log"; then A3_3_ADD=1; fi

  if grep -F "last loadFile(any):" "$CHECK_DIR/01.log" | tail -n 1 | grep -Fq "$NON_TARGET_GUARD_PEN"; then GUARD_01_LAST_LOAD_NON_TARGET=1; fi
  if grep -F "last addResource(any):" "$CHECK_DIR/01.log" | tail -n 1 | grep -Fq "$NON_TARGET_GUARD_PEN"; then GUARD_01_LAST_ADD_NON_TARGET=1; fi
  if grep -F "last initialized(any):" "$CHECK_DIR/01.log" | tail -n 1 | grep -Fq "$NON_TARGET_GUARD_PEN"; then GUARD_01_LAST_INIT_NON_TARGET=1; fi
  if grep -F "last loadFile(any):" "$CHECK_DIR/02.log" | tail -n 1 | grep -Fq "$NON_TARGET_GUARD_PEN"; then GUARD_02_LAST_LOAD_NON_TARGET=1; fi
  if grep -F "last addResource(any):" "$CHECK_DIR/02.log" | tail -n 1 | grep -Fq "$NON_TARGET_GUARD_PEN"; then GUARD_02_LAST_ADD_NON_TARGET=1; fi
  if grep -F "last initialized(any):" "$CHECK_DIR/02.log" | tail -n 1 | grep -Fq "$NON_TARGET_GUARD_PEN"; then GUARD_02_LAST_INIT_NON_TARGET=1; fi
  if grep -F "last loadFile(any):" "$CHECK_DIR/03.log" | tail -n 1 | grep -Fq "$NON_TARGET_GUARD_PEN"; then GUARD_03_LAST_LOAD_NON_TARGET=1; fi
  if grep -F "last addResource(any):" "$CHECK_DIR/03.log" | tail -n 1 | grep -Fq "$NON_TARGET_GUARD_PEN"; then GUARD_03_LAST_ADD_NON_TARGET=1; fi
  if grep -F "last initialized(any):" "$CHECK_DIR/03.log" | tail -n 1 | grep -Fq "$NON_TARGET_GUARD_PEN"; then GUARD_03_LAST_INIT_NON_TARGET=1; fi
fi

write_exit "warmup" "$WARMUP_RC"
write_exit "check_01" "$CHECK1_RC"
write_exit "check_02" "$CHECK2_RC"
write_exit "check_03" "$CHECK3_RC"
write_exit "check_01_latest_load_target" "$A3_1_LOAD"
write_exit "check_01_latest_add_target" "$A3_1_ADD"
write_exit "check_02_latest_load_target" "$A3_2_LOAD"
write_exit "check_02_latest_add_target" "$A3_2_ADD"
write_exit "check_03_latest_load_target" "$A3_3_LOAD"
write_exit "check_03_latest_add_target" "$A3_3_ADD"
write_exit "guardrail_check_01_last_load_non_target" "$GUARD_01_LAST_LOAD_NON_TARGET"
write_exit "guardrail_check_01_last_add_non_target" "$GUARD_01_LAST_ADD_NON_TARGET"
write_exit "guardrail_check_01_last_initialized_non_target" "$GUARD_01_LAST_INIT_NON_TARGET"
write_exit "guardrail_check_02_last_load_non_target" "$GUARD_02_LAST_LOAD_NON_TARGET"
write_exit "guardrail_check_02_last_add_non_target" "$GUARD_02_LAST_ADD_NON_TARGET"
write_exit "guardrail_check_02_last_initialized_non_target" "$GUARD_02_LAST_INIT_NON_TARGET"
write_exit "guardrail_check_03_last_load_non_target" "$GUARD_03_LAST_LOAD_NON_TARGET"
write_exit "guardrail_check_03_last_add_non_target" "$GUARD_03_LAST_ADD_NON_TARGET"
write_exit "guardrail_check_03_last_initialized_non_target" "$GUARD_03_LAST_INIT_NON_TARGET"

A2_RC=1
A3_RC=1
if [[ "$CHECK1_RC" -eq 0 && "$CHECK2_RC" -eq 0 && "$CHECK3_RC" -eq 0 ]]; then
  A2_RC=0
fi
if [[ "$A3_1_LOAD" -eq 1 && "$A3_1_ADD" -eq 1 && "$A3_2_LOAD" -eq 1 && "$A3_2_ADD" -eq 1 && "$A3_3_LOAD" -eq 1 && "$A3_3_ADD" -eq 1 ]]; then
  A3_RC=0
fi
write_exit "a2_three_consecutive_checks_zero" "$A2_RC"
write_exit "a3_latest_markers_all_target" "$A3_RC"

GUARDRAIL_NON_TARGET_ACTIVE=0
if [[ "$GUARD_POST_LAUNCH_NON_TARGET_COUNT" -gt 0 || \
      "$GUARD_01_LAST_LOAD_NON_TARGET" -eq 1 || "$GUARD_01_LAST_ADD_NON_TARGET" -eq 1 || "$GUARD_01_LAST_INIT_NON_TARGET" -eq 1 || \
      "$GUARD_02_LAST_LOAD_NON_TARGET" -eq 1 || "$GUARD_02_LAST_ADD_NON_TARGET" -eq 1 || "$GUARD_02_LAST_INIT_NON_TARGET" -eq 1 || \
      "$GUARD_03_LAST_LOAD_NON_TARGET" -eq 1 || "$GUARD_03_LAST_ADD_NON_TARGET" -eq 1 || "$GUARD_03_LAST_INIT_NON_TARGET" -eq 1 ]]; then
  GUARDRAIL_NON_TARGET_ACTIVE=1
fi
write_exit "guardrail_non_target_active_any" "$GUARDRAIL_NON_TARGET_ACTIVE"

if [[ -f "$MAIN_LOG" ]]; then
  write_cmd "tail -n $TAIL_LINES $MAIN_LOG > $LOG_DIR/main.log.tail.txt"
  tail -n "$TAIL_LINES" "$MAIN_LOG" >"$LOG_DIR/main.log.tail.txt" || true
else
  write_cmd "main log missing: $MAIN_LOG"
  echo "[WARN] main log missing: $MAIN_LOG" >"$LOG_DIR/main.log.tail.txt"
fi

if [[ -f "$RUNTIME_LOG" ]]; then
  write_cmd "tail -n $TAIL_LINES $RUNTIME_LOG > $LOG_DIR/pencil-dev.log.tail.txt"
  tail -n "$TAIL_LINES" "$RUNTIME_LOG" >"$LOG_DIR/pencil-dev.log.tail.txt" || true
else
  write_cmd "runtime log missing: $RUNTIME_LOG"
  echo "[WARN] runtime log missing: $RUNTIME_LOG" >"$LOG_DIR/pencil-dev.log.tail.txt"
fi

MCP_RC=0
RC_LIST=127
RC_GET=127
if command -v codex >/dev/null 2>&1; then
  write_cmd "codex mcp list > $MCP_DIR/codex_mcp_list.log"
  set +e
  run_mcp_cmd "$MCP_DIR/codex_mcp_list.log" codex mcp list
  RC_LIST=$?
  run_mcp_cmd "$MCP_DIR/codex_mcp_get_pencil.log" codex mcp get pencil
  RC_GET=$?
  set -e
  if [[ "$RC_LIST" -ne 0 || "$RC_GET" -ne 0 ]]; then
    MCP_RC=1
  fi
else
  MCP_RC=127
  echo "[ERROR] codex CLI not found in PATH" >"$MCP_DIR/codex_mcp_get_pencil.log"
fi
write_exit "mcp_cli" "$MCP_RC"
write_exit "mcp" "$MCP_RC"
write_exit "mcp_list" "$RC_LIST"
write_exit "mcp_get_pencil" "$RC_GET"

COMPAT_PROCESS_SNAPSHOT="$ARTIFACT_DIR/process_snapshot.txt"
COMPAT_CHECK_LOG="$ARTIFACT_DIR/check.log"
COMPAT_MCP_LOG="$ARTIFACT_DIR/mcp.log"
COMPAT_EXIT_CODES="$ARTIFACT_DIR/exit_codes.txt"

write_cmd "compat-process-snapshot -> $COMPAT_PROCESS_SNAPSHOT"
{
  echo "=== process/pre.txt ==="
  cat "$PROCESS_DIR/pre.txt" 2>/dev/null || true
  echo
  echo "=== process/post_kill.txt ==="
  cat "$PROCESS_DIR/post_kill.txt" 2>/dev/null || true
  echo
  echo "=== process/post_launch.txt ==="
  cat "$PROCESS_DIR/post_launch.txt" 2>/dev/null || true
} >"$COMPAT_PROCESS_SNAPSHOT"

write_cmd "compat-check-log -> $COMPAT_CHECK_LOG"
{
  for f in "$CHECK_DIR/warmup.log" "$CHECK_DIR/01.log" "$CHECK_DIR/02.log" "$CHECK_DIR/03.log"; do
    [[ -f "$f" ]] || continue
    echo "=== ${f#$ARTIFACT_DIR/} ==="
    cat "$f"
    echo
  done
} >"$COMPAT_CHECK_LOG"

write_cmd "compat-mcp-log -> $COMPAT_MCP_LOG"
{
  for f in "$MCP_DIR/codex_mcp_list.log" "$MCP_DIR/codex_mcp_get_pencil.log"; do
    [[ -f "$f" ]] || continue
    echo "=== ${f#$ARTIFACT_DIR/} ==="
    cat "$f"
    echo
  done
} >"$COMPAT_MCP_LOG"

write_cmd "compat-exit-codes -> $COMPAT_EXIT_CODES"
cp "$EXIT_FILE" "$COMPAT_EXIT_CODES"

FINAL_RC=0
if [[ "$START_RC" -ne 0 || "$A1_RC" -ne 0 || "$A2_RC" -ne 0 || "$A3_RC" -ne 0 || "$MCP_RC" -ne 0 || "$GUARDRAIL_NON_TARGET_ACTIVE" -ne 0 ]]; then
  FINAL_RC=1
fi
CHECK_AGG_RC=1
if [[ "$CHECK1_RC" -eq 0 && "$CHECK2_RC" -eq 0 && "$CHECK3_RC" -eq 0 ]]; then
  CHECK_AGG_RC=0
fi
write_exit "check" "$CHECK_AGG_RC"
write_exit "final" "$FINAL_RC"
echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >>"$EXIT_FILE"

echo "[INFO] artifact_dir=$ARTIFACT_DIR"
echo "[INFO] commands=$COMMANDS_FILE"
echo "[INFO] checks_dir=$CHECK_DIR"
echo "[INFO] process_dir=$PROCESS_DIR"
echo "[INFO] mcp_dir=$MCP_DIR"
echo "[INFO] logs_dir=$LOG_DIR"
echo "[INFO] exit_codes=$EXIT_FILE"

if [[ "$FINAL_RC" -ne 0 ]]; then
  echo "MUS1822_PATH_A_GATE: FAIL"
  echo "[TBD: awaiting real data] owner=Founding Engineer field=mus1817_proof_bundle_failed eta=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  print_mcp_failure_hint
else
  echo "MUS1822_PATH_A_GATE: PASS"
  print_mcp_banner
fi

exit "$FINAL_RC"
