#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/mcp_banner.sh"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 /absolute/path/to/file.pen"
  exit 1
fi

PEN_FILE="$1"
if [[ ! -f "$PEN_FILE" ]]; then
  echo "[ERROR] .pen file not found: $PEN_FILE"
  exit 1
fi

DEFAULT_BIN="/home/hugh51/tools/Pencil-1.1.24-linux-x64/pencil"
FALLBACK_BIN="/home/hugh51/Pencil-linux-x86_64.AppImage"
USER_DATA_DIR="${PENCIL_USER_DATA_DIR:-}"
CONFIG_ROOT="${PENCIL_CONFIG_DIR:-${USER_DATA_DIR:-$HOME/.config/Pencil}}"
CONFIG_FILE="${PENCIL_CONFIG_FILE:-$CONFIG_ROOT/config.json}"
# Default to AppImage for desktop stability; the pinned binary can still be
# forced via PENCIL_PREFER_APPIMAGE=0 / PENCIL_BIN.
PREFER_APPIMAGE="${PENCIL_PREFER_APPIMAGE:-1}"

is_desktop_candidate() {
  local candidate="$1"
  [[ -n "$candidate" && -x "$candidate" ]] || return 1
  case "$candidate" in
    */.npm-global/bin/pencil|*/node_modules/.bin/pencil)
      return 1
      ;;
  esac
  return 0
}

# Prefer explicit env override. Avoid CLI wrappers in PATH, which do not launch
# the desktop app and break MCP attach.
if [[ -n "${PENCIL_BIN:-}" ]]; then
  PENCIL_BIN="$PENCIL_BIN"
elif [[ "$PREFER_APPIMAGE" == "1" && -x "$FALLBACK_BIN" ]]; then
  PENCIL_BIN="$FALLBACK_BIN"
elif [[ -x "$DEFAULT_BIN" ]]; then
  PENCIL_BIN="$DEFAULT_BIN"
elif is_desktop_candidate "$(command -v pencil 2>/dev/null || true)"; then
  PENCIL_BIN="$(command -v pencil)"
else
  PENCIL_BIN="$FALLBACK_BIN"
fi

if [[ ! -x "$PENCIL_BIN" ]]; then
  echo "[ERROR] Pencil binary not executable."
  echo "Checked:"
  echo "  - $(command -v pencil 2>/dev/null || echo pencil-not-found)"
  echo "  - $DEFAULT_BIN"
  echo "  - $FALLBACK_BIN"
  exit 1
fi

PID_FILE="${PENCIL_PID_FILE:-/tmp/pencil-dev.pid}"
LOG_FILE="${PENCIL_LOG_FILE:-/tmp/pencil-dev.log}"
FORCE_LAUNCH="${PENCIL_FORCE_LAUNCH:-0}"
EXCLUSIVE_POLICY="${PENCIL_EXCLUSIVE_POLICY:-allow}"
USE_DISABLE_GPU="${PENCIL_DISABLE_GPU:-1}"
RETRY_WITHOUT_DISABLE_GPU="${PENCIL_RETRY_WITHOUT_DISABLE_GPU:-1}"
FORCE_X11="${PENCIL_FORCE_X11:-1}"
FORCE_PRODUCTION_MODE="${PENCIL_FORCE_PRODUCTION_MODE:-1}"
STABILITY_SECS="${PENCIL_STABILITY_SECS:-10}"
POST_START_DELAY_SECS="${PENCIL_POST_START_DELAY_SECS:-2}"
PENCIL_NODE_ENV="${PENCIL_NODE_ENV:-production}"
if ! [[ "$STABILITY_SECS" =~ ^[0-9]+$ ]] || [[ "$STABILITY_SECS" -lt 1 ]]; then
  STABILITY_SECS=10
fi
if ! [[ "$POST_START_DELAY_SECS" =~ ^[0-9]+$ ]] || [[ "$POST_START_DELAY_SECS" -lt 0 ]]; then
  POST_START_DELAY_SECS=2
fi
if ! [[ "$FORCE_PRODUCTION_MODE" =~ ^[0-9]+$ ]]; then
  FORCE_PRODUCTION_MODE=1
fi
if [[ "$FORCE_PRODUCTION_MODE" -ne 0 ]]; then
  FORCE_PRODUCTION_MODE=1
fi

case "$EXCLUSIVE_POLICY" in
  allow|fail_closed|force_clean)
    ;;
  *)
    echo "[WARN] Unknown PENCIL_EXCLUSIVE_POLICY='$EXCLUSIVE_POLICY'; using 'allow'."
    EXCLUSIVE_POLICY="allow"
    ;;
esac

ensure_startup_pen_target() {
  local tmp

  if ! command -v jq >/dev/null 2>&1; then
    echo "[WARN] jq not found; skipping config preseed for target .pen"
    return 0
  fi

  mkdir -p "$(dirname "$CONFIG_FILE")"
  tmp="$(mktemp)"

  if [[ -f "$CONFIG_FILE" ]]; then
    if ! jq --arg pen "$PEN_FILE" '
      .recentFiles = ([$pen] + ((.recentFiles // []) | map(select(. != $pen)))) |
      .startupFile = $pen
    ' "$CONFIG_FILE" >"$tmp"; then
      echo "[WARN] Failed to patch Pencil config, leaving existing file intact: $CONFIG_FILE"
      rm -f "$tmp"
      return 0
    fi
  else
    jq -n --arg pen "$PEN_FILE" '{recentFiles: [$pen], startupFile: $pen}' >"$tmp"
  fi

  mv "$tmp" "$CONFIG_FILE"
  echo "[INFO] Preseeded Pencil startup target in config: $PEN_FILE"
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

first_main_pid() {
  local pid
  while IFS= read -r pid; do
    if pid_matches_scope "$pid"; then
      echo "$pid"
      return 0
    fi
  done < <(list_main_pids)
  return 1
}

first_main_pid_any() {
  local pid
  while IFS= read -r pid; do
    if [[ -n "$pid" ]] && ps -p "$pid" >/dev/null 2>&1; then
      echo "$pid"
      return 0
    fi
  done < <(list_main_pids)
  return 1
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

pen_for_pid() {
  local pid="$1"
  local args
  if [[ -z "$pid" ]] || ! ps -p "$pid" >/dev/null 2>&1; then
    return 1
  fi
  args="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  extract_pen_from_args "$args"
}

emit_blocker_row() {
  local field="$1"
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "[TBD: awaiting real data] owner=Founding Engineer field=$field eta=$now"
}

ensure_exclusive_window() {
  local pid="$1"
  local source="$2"
  local active_pen=""
  local remaining=""

  active_pen="$(pen_for_pid "$pid" || true)"
  if [[ -n "$active_pen" && "$active_pen" == "$PEN_FILE" ]]; then
    echo "$pid" >"$PID_FILE"
    echo "[INFO] Pencil already running for target (pid=$pid)."
    echo "[INFO] log=$LOG_FILE"
    print_mcp_banner
    exit 0
  fi

  case "$EXCLUSIVE_POLICY" in
    allow)
      echo "$pid" >"$PID_FILE"
      echo "[INFO] Pencil already running (pid=$pid)."
      if [[ -n "$active_pen" ]]; then
        echo "[WARN] Active runtime target differs from requested target."
        echo "  active: $active_pen"
        echo "  requested: $PEN_FILE"
      else
        echo "[WARN] Active runtime target is unknown (no .pen argument found)."
      fi
      echo "[INFO] Updated PID file: $PID_FILE"
      echo "[INFO] Set PENCIL_FORCE_LAUNCH=1 to force a new launch attempt."
      print_mcp_banner
      exit 0
      ;;
    fail_closed)
      echo "[ERROR] Exclusive runtime policy blocked launch."
      echo "  source: $source"
      echo "  pid: $pid"
      echo "  active_pen: ${active_pen:-unknown}"
      echo "  requested_pen: $PEN_FILE"
      emit_blocker_row "non_target_active_session"
      print_mcp_failure_hint
      exit 5
      ;;
    force_clean)
      echo "[INFO] Exclusive runtime policy force-clean triggered."
      echo "  source: $source"
      echo "  pid: $pid"
      echo "  active_pen: ${active_pen:-unknown}"
      echo "  requested_pen: $PEN_FILE"
      if ps -p "$pid" >/dev/null 2>&1; then
        kill "$pid" >/dev/null 2>&1 || true
        sleep 1
      fi
      if ps -p "$pid" >/dev/null 2>&1; then
        kill -9 "$pid" >/dev/null 2>&1 || true
      fi
      "$SCRIPT_DIR/stop_pencil_dev.sh" || true
      remaining="$(first_main_pid_any || true)"
      if [[ -n "$remaining" ]]; then
        echo "[ERROR] Failed to clear active Pencil runtime before launch. remaining_pid=$remaining"
        emit_blocker_row "exclusive_runtime_cleanup_failed"
        print_mcp_failure_hint
        exit 6
      fi
      rm -f "$PID_FILE"
      ;;
  esac
}

is_main_pid() {
  local pid="$1"
  local args lower comm

  if [[ -z "$pid" ]] || ! ps -p "$pid" >/dev/null 2>&1; then
    return 1
  fi

  comm="$(ps -p "$pid" -o comm= 2>/dev/null | tr '[:upper:]' '[:lower:]' || true)"
  args="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  lower="$(printf '%s' "$args" | tr '[:upper:]' '[:lower:]')"

  if [[ -n "$USER_DATA_DIR" && "$args" != *"--user-data-dir=$USER_DATA_DIR"* ]]; then
    return 1
  fi

  [[ "$comm" =~ ^(awk|bash|sh|dash|zsh|fish|rg|grep|sed|head|tail|ps)$ ]] && return 1
  [[ "$lower" == *"mcp-server-linux-x64"* ]] && return 1
  [[ "$args" == *"--no-sandbox"* ]] || return 1
  [[ "$args" == *"--type="* ]] && return 1
  [[ "$lower" == *"pencil"* || "$lower" == *"apprun"* || "$lower" == *"electron"* ]]
}

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if is_main_pid "$OLD_PID"; then
    ensure_exclusive_window "$OLD_PID" "pid-file"
  fi
  rm -f "$PID_FILE"
fi

# Avoid launching duplicate instances unless explicitly forced.
RUNNING_PID="$(first_main_pid || true)"
RUNNING_PID_ANY="$(first_main_pid_any || true)"
if [[ "$FORCE_LAUNCH" != "1" ]]; then
  if [[ -n "$RUNNING_PID" ]]; then
    ensure_exclusive_window "$RUNNING_PID" "process-scan"
  elif [[ "$EXCLUSIVE_POLICY" != "allow" && -n "$RUNNING_PID_ANY" ]]; then
    ensure_exclusive_window "$RUNNING_PID_ANY" "process-scan-any"
  fi
elif [[ "$EXCLUSIVE_POLICY" != "allow" ]]; then
  if [[ -n "$RUNNING_PID" ]]; then
    ensure_exclusive_window "$RUNNING_PID" "force-launch-preflight"
  elif [[ -n "$RUNNING_PID_ANY" ]]; then
    ensure_exclusive_window "$RUNNING_PID_ANY" "force-launch-preflight-any"
  fi
fi

build_args() {
  local disable_gpu="$1"
  local -a args
  args=(--no-sandbox --enable-unsafe-swiftshader)
  if [[ -n "$USER_DATA_DIR" ]]; then
    args+=("--user-data-dir=$USER_DATA_DIR")
  fi
  if [[ "$disable_gpu" == "1" ]]; then
    args+=(--disable-gpu)
  fi
  printf '%s\n' "${args[@]}"
}

launch_once() {
  local disable_gpu="$1"
  local -a args
  local -a env_kv
  local launch_pid monitor_pid handoff_pid
  local sec

  mapfile -t args < <(build_args "$disable_gpu")
  env_kv=()
  env_kv+=("NODE_ENV=$PENCIL_NODE_ENV")

  # docs.pencil.dev troubleshooting recommends X11 for Linux stability.
  if [[ "$FORCE_X11" == "1" ]]; then
    env_kv+=(ELECTRON_OZONE_PLATFORM_HINT=x11)
    env_kv+=(GDK_BACKEND=x11)
  fi

  # This shell exports NODE_ENV=development. Force production runtime for
  # desktop attach stability and to avoid localhost:3000 dev boot drift.
  if [[ "$FORCE_PRODUCTION_MODE" == "1" ]]; then
    env_kv+=(NODE_ENV=production)
    env_kv+=(ELECTRON_IS_DEV=0)
  fi

  echo "[INFO] Starting Pencil:"
  echo "  bin: $PENCIL_BIN"
  echo "  pen: $PEN_FILE"
  echo "  log: $LOG_FILE"
  if [[ -n "$USER_DATA_DIR" ]]; then
    echo "  user-data-dir: $USER_DATA_DIR"
  fi
  echo "  flags: ${args[*]}"
  if [[ ${#env_kv[@]} -gt 0 ]]; then
    echo "  env: ${env_kv[*]}"
  fi

  if [[ -n "$USER_DATA_DIR" ]]; then
    mkdir -p "$USER_DATA_DIR"
  fi
  ensure_startup_pen_target

  nohup env "${env_kv[@]}" "$PENCIL_BIN" "${args[@]}" "$PEN_FILE" >"$LOG_FILE" 2>&1 &
  launch_pid="$!"
  echo "$launch_pid" >"$PID_FILE"

  sleep "$POST_START_DELAY_SECS"
  monitor_pid="$launch_pid"

  for ((sec = 0; sec < STABILITY_SECS; sec++)); do
    if is_main_pid "$monitor_pid"; then
      sleep 1
      continue
    fi

    # Single-instance handoff: launch pid exits, but active instance exists.
    handoff_pid="$(first_main_pid || true)"
    if [[ -n "$handoff_pid" ]]; then
      if [[ "$handoff_pid" != "$monitor_pid" ]]; then
        echo "[INFO] Single-instance handoff detected: $monitor_pid -> $handoff_pid"
      fi
      monitor_pid="$handoff_pid"
      sleep 1
      continue
    fi

    echo "[WARN] Pencil exited before stability window (${sec}s/${STABILITY_SECS}s)."
    echo "[INFO] Last log lines:"
    tail -n 120 "$LOG_FILE" || true
    return 1
  done

  echo "$monitor_pid" >"$PID_FILE"
  echo "[OK] Pencil running (pid=$monitor_pid)"
  echo "[OK] PID file: $PID_FILE"
  echo "[OK] Runtime log: $LOG_FILE"
  return 0
}

if launch_once "$USE_DISABLE_GPU"; then
  if [[ -x "$SCRIPT_DIR/sync_pencil_mcp.sh" ]]; then
    "$SCRIPT_DIR/sync_pencil_mcp.sh" || true
  fi
  print_mcp_banner
  exit 0
fi

if [[ "$USE_DISABLE_GPU" == "1" && "$RETRY_WITHOUT_DISABLE_GPU" == "1" ]]; then
  echo "[INFO] Retrying once without --disable-gpu for Linux compatibility..."
  if launch_once "0"; then
    if [[ -x "$SCRIPT_DIR/sync_pencil_mcp.sh" ]]; then
      "$SCRIPT_DIR/sync_pencil_mcp.sh" || true
    fi
    print_mcp_banner
    exit 0
  fi
fi

echo "[ERROR] Pencil failed to stay running after retries."
exit 2
