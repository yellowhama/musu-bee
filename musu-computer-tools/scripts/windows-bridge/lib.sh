#!/usr/bin/env bash
set -euo pipefail

WINDOWS_BRIDGE_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WINDOWS_BRIDGE_REPO_ROOT="$(cd "$WINDOWS_BRIDGE_SCRIPT_DIR/../.." && pwd)"
WINDOWS_BRIDGE_RUNTIME_ROOT="$WINDOWS_BRIDGE_REPO_ROOT/.windows-bridge"
WINDOWS_BRIDGE_QUEUE="$WINDOWS_BRIDGE_RUNTIME_ROOT/queue"
WINDOWS_BRIDGE_PROCESSING="$WINDOWS_BRIDGE_RUNTIME_ROOT/processing"
WINDOWS_BRIDGE_RESULTS="$WINDOWS_BRIDGE_RUNTIME_ROOT/results"
WINDOWS_BRIDGE_LOGS="$WINDOWS_BRIDGE_RUNTIME_ROOT/logs"
WINDOWS_BRIDGE_STATE="$WINDOWS_BRIDGE_RUNTIME_ROOT/state"
WINDOWS_BRIDGE_WINEXEC="$WINDOWS_BRIDGE_REPO_ROOT/skills/wsl-windows-exec/scripts/winexec.sh"
WINDOWS_BRIDGE_WINDOWS_POWERSHELL="/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"

windows_bridge::ensure_runtime_dirs() {
  mkdir -p \
    "$WINDOWS_BRIDGE_QUEUE" \
    "$WINDOWS_BRIDGE_PROCESSING" \
    "$WINDOWS_BRIDGE_RESULTS" \
    "$WINDOWS_BRIDGE_LOGS" \
    "$WINDOWS_BRIDGE_STATE"
}

windows_bridge::abspath() {
  local path="$1"

  if [ -d "$path" ]; then
    (cd "$path" && pwd)
    return
  fi

  local dir
  local base
  dir="$(dirname "$path")"
  base="$(basename "$path")"
  printf '%s/%s\n' "$(cd "$dir" && pwd)" "$base"
}

windows_bridge::linux_path_to_windows() {
  local path="$1"

  if [[ "$path" =~ ^/mnt/([a-zA-Z])/(.*)$ ]]; then
    local drive="${BASH_REMATCH[1]}"
    local rest="${BASH_REMATCH[2]}"
    rest="${rest//\//\\}"
    printf '%s:\\%s\n' "${drive^^}" "$rest"
    return
  fi

  local distro="${WSL_DISTRO_NAME:-Ubuntu-22.04}"
  local trimmed="${path#/}"
  local rest="${trimmed//\//\\}"
  printf '\\\\wsl.localhost\\%s\\%s\n' "$distro" "$rest"
}

windows_bridge::is_windows_path() {
  local path="${1:-}"
  [[ "$path" =~ ^[A-Za-z]:\\ ]] || [[ "$path" =~ ^\\\\ ]]
}

windows_bridge::path_to_windows() {
  local path="${1:-}"

  if [ -z "$path" ]; then
    printf '\n'
    return
  fi

  if windows_bridge::is_windows_path "$path"; then
    printf '%s\n' "$path"
    return
  fi

  windows_bridge::linux_path_to_windows "$(windows_bridge::abspath "$path")"
}

windows_bridge::compact_output() {
  local text="${1:-}"
  text="${text//$'\r'/ }"
  text="${text//$'\n'/ }"
  text="$(printf '%s' "$text" | sed 's/[[:space:]][[:space:]]*/ /g')"
  printf '%.240s' "$text"
}

windows_bridge::args_to_json() {
  if [ "$#" -eq 0 ]; then
    printf '[]'
    return
  fi

  printf '%s\0' "$@" | jq -Rs 'split("\u0000")[:-1]'
}

windows_bridge::result_path() {
  printf '%s/%s.json\n' "$WINDOWS_BRIDGE_RESULTS" "$1"
}

windows_bridge::heartbeat_path() {
  printf '%s/helper-heartbeat.json\n' "$WINDOWS_BRIDGE_STATE"
}

windows_bridge::install_state_path() {
  printf '%s/helper-install-state.json\n' "$WINDOWS_BRIDGE_STATE"
}

windows_bridge::audit_log_path() {
  printf '%s/action-audit.jsonl\n' "$WINDOWS_BRIDGE_STATE"
}

windows_bridge::path_extension() {
  local path="${1:-}"
  local base="${path##*/}"
  local extension=""

  if [[ "$base" == *.* ]]; then
    extension="${base##*.}"
  fi

  printf '%s\n' "${extension,,}"
}

windows_bridge::entrypoint_type() {
  local path="${1:-}"

  case "$(windows_bridge::path_extension "$path")" in
    ps1)
      printf 'powershell_script\n'
      ;;
    cmd)
      printf 'cmd_wrapper\n'
      ;;
    bat)
      printf 'batch_wrapper\n'
      ;;
    exe)
      printf 'windows_binary\n'
      ;;
    sh)
      printf 'shell_script\n'
      ;;
    *)
      printf 'unknown\n'
      ;;
  esac
}

windows_bridge::request_kind_for_path() {
  local path="${1:-}"

  case "$(windows_bridge::entrypoint_type "$path")" in
    powershell_script)
      printf 'powershell_file\n'
      ;;
    cmd_wrapper|batch_wrapper)
      printf 'cmd_file\n'
      ;;
    *)
      return 1
      ;;
  esac
}
