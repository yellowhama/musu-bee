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
USE_DISABLE_GPU="${PENCIL_DISABLE_GPU:-1}"
RETRY_WITHOUT_DISABLE_GPU="${PENCIL_RETRY_WITHOUT_DISABLE_GPU:-1}"
FORCE_X11="${PENCIL_FORCE_X11:-1}"
STABILITY_SECS="${PENCIL_STABILITY_SECS:-10}"
POST_START_DELAY_SECS="${PENCIL_POST_START_DELAY_SECS:-2}"
if ! [[ "$STABILITY_SECS" =~ ^[0-9]+$ ]] || [[ "$STABILITY_SECS" -lt 1 ]]; then
  STABILITY_SECS=10
fi
if ! [[ "$POST_START_DELAY_SECS" =~ ^[0-9]+$ ]] || [[ "$POST_START_DELAY_SECS" -lt 0 ]]; then
  POST_START_DELAY_SECS=2
fi

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
    echo "[INFO] Pencil already running via PID file (pid=$OLD_PID)."
    echo "[INFO] log=$LOG_FILE"
    print_mcp_banner
    exit 0
  fi
  rm -f "$PID_FILE"
fi

# Avoid launching duplicate instances unless explicitly forced.
if [[ "$FORCE_LAUNCH" != "1" ]]; then
  RUNNING_PID="$(first_main_pid || true)"
  if [[ -n "$RUNNING_PID" ]]; then
    echo "$RUNNING_PID" >"$PID_FILE"
    echo "[INFO] Pencil already running (pid=$RUNNING_PID)."
    echo "[INFO] Updated PID file: $PID_FILE"
    echo "[INFO] Set PENCIL_FORCE_LAUNCH=1 to force a new launch attempt."
    print_mcp_banner
    exit 0
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

  # docs.pencil.dev troubleshooting recommends X11 for Linux stability.
  if [[ "$FORCE_X11" == "1" ]]; then
    env_kv+=(ELECTRON_OZONE_PLATFORM_HINT=x11)
    env_kv+=(GDK_BACKEND=x11)
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
