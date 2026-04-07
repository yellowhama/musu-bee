#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

windows_bridge::ensure_runtime_dirs

probe_command() {
  local use_timeout=1
  local output
  local rc

  if [ "${1:-}" = "--no-timeout" ]; then
    use_timeout=0
    shift
  fi

  if [ "$use_timeout" -eq 1 ]; then
    if output="$(timeout 5s "$@" 2>&1)"; then
      rc=0
    else
      rc=$?
    fi
  elif output="$("$@" 2>&1)"; then
    rc=0
  else
    rc=$?
  fi

  printf '%s\n' "$rc"
  printf '%s\n' "$(windows_bridge::compact_output "$output")"
}

status_from_rc() {
  local rc="$1"
  if [ "$rc" -eq 0 ]; then
    printf 'ok\n'
  else
    printf 'error\n'
  fi
}

mapfile -t direct_probe < <(probe_command --no-timeout /mnt/c/Windows/System32/cmd.exe /C ver)
mapfile -t winexec_probe < <(probe_command "$WINDOWS_BRIDGE_WINEXEC" /mnt/c/Windows/System32/cmd.exe /C ver)

direct_rc="${direct_probe[0]}"
direct_summary="${direct_probe[1]:-}"
winexec_rc="${winexec_probe[0]}"
winexec_summary="${winexec_probe[1]:-}"

heartbeat_path="$(windows_bridge::heartbeat_path)"
helper_status="offline"
helper_last_seen=""
helper_age_seconds_json="null"

if [ -f "$heartbeat_path" ]; then
  helper_last_seen="$(jq -r '.last_seen // empty' "$heartbeat_path" 2>/dev/null || true)"
  helper_age_seconds=$(( $(date +%s) - $(stat -c %Y "$heartbeat_path") ))
  helper_age_seconds_json="$helper_age_seconds"

  if [ "$helper_age_seconds" -le 15 ]; then
    helper_status="online"
  else
    helper_status="stale"
  fi
fi

recommended_mode="manual"
if [ "$winexec_rc" -eq 0 ]; then
  recommended_mode="direct"
elif [ "$helper_status" = "online" ]; then
  recommended_mode="helper"
fi

start_helper_windows_path="$(windows_bridge::linux_path_to_windows "$WINDOWS_BRIDGE_REPO_ROOT/scripts/windows-bridge/start-helper.cmd")"
manual_runner_windows_path="$(windows_bridge::linux_path_to_windows "$WINDOWS_BRIDGE_REPO_ROOT/scripts/windows-bridge/run-musu-port-smoke.cmd")"

jq -n \
  --arg recommended_mode "$recommended_mode" \
  --arg direct_status "$(status_from_rc "$direct_rc")" \
  --arg direct_summary "$direct_summary" \
  --arg winexec_status "$(status_from_rc "$winexec_rc")" \
  --arg winexec_summary "$winexec_summary" \
  --arg helper_status "$helper_status" \
  --arg helper_last_seen "$helper_last_seen" \
  --arg start_helper_windows_path "$start_helper_windows_path" \
  --arg manual_runner_windows_path "$manual_runner_windows_path" \
  --argjson direct_exit_code "$direct_rc" \
  --argjson winexec_exit_code "$winexec_rc" \
  --argjson helper_age_seconds "$helper_age_seconds_json" \
  '{
    recommended_mode: $recommended_mode,
    direct_exec: {
      status: $direct_status,
      exit_code: $direct_exit_code,
      summary: $direct_summary
    },
    winexec_bridge: {
      status: $winexec_status,
      exit_code: $winexec_exit_code,
      summary: $winexec_summary
    },
    helper: {
      status: $helper_status,
      last_seen: $helper_last_seen,
      age_seconds: $helper_age_seconds
    },
    actions: {
      start_helper_windows_path: $start_helper_windows_path,
      manual_runner_windows_path: $manual_runner_windows_path
    }
  }'
