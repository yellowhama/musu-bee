#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

windows_bridge::ensure_runtime_dirs

probe_command() {
  local output=""
  local rc=0

  if output="$(timeout 5s "$@" 2>&1)"; then
    rc=0
  else
    rc=$?
  fi

  jq -n \
    --argjson exit_code "$rc" \
    --arg summary "$(windows_bridge::compact_output "$output")" \
    '{
      exit_code: $exit_code,
      summary: $summary
    }'
}

classify_failure() {
  local direct_exit_code="$1"
  local direct_summary="$2"
  local winexec_summary="$3"
  local winexec_exit_code="$4"

  if [ "$direct_exit_code" -eq 0 ]; then
    printf 'direct_exec_ok\n'
    return
  fi

  if [ "$winexec_exit_code" -eq 0 ]; then
    printf 'winexec_bridge_ok\n'
    return
  fi

  local combined="$direct_summary $winexec_summary"
  combined="$(printf '%s' "$combined" | tr '[:upper:]' '[:lower:]')"

  if [[ "$combined" == *"accept4 failed 110"* ]]; then
    printf 'wsl_interop_callback_timeout\n'
  elif [[ "$combined" == *"utilbindvsockanyport"* ]] || [[ "$combined" == *"socket failed 1"* ]]; then
    printf 'wsl_vsock_bind_failure\n'
  elif [[ "$combined" == *"cannot execute: required file not found"* ]]; then
    printf 'binfmt_or_init_visibility_failure\n'
  else
    printf 'unknown_interop_failure\n'
  fi
}

probe_json="$("$SCRIPT_DIR/probe-interop.sh")"
helper_status_json="$(bash "$SCRIPT_DIR/status-helper.sh")"
direct_probe_json="$(probe_command /mnt/c/Windows/System32/cmd.exe /C ver)"
winexec_probe_json="$(probe_command "$WINDOWS_BRIDGE_WINEXEC" /mnt/c/Windows/System32/cmd.exe /C ver)"

direct_summary="$(printf '%s\n' "$direct_probe_json" | jq -r '.summary')"
direct_exit_code="$(printf '%s\n' "$direct_probe_json" | jq -r '.exit_code')"
winexec_summary="$(printf '%s\n' "$winexec_probe_json" | jq -r '.summary')"
winexec_exit_code="$(printf '%s\n' "$winexec_probe_json" | jq -r '.exit_code')"
failure_class="$(classify_failure "$direct_exit_code" "$direct_summary" "$winexec_summary" "$winexec_exit_code")"

run_wsl_sockets_json="$(
  find /run/WSL -maxdepth 2 \( -type s -o -type f \) 2>/dev/null \
    | sort \
    | jq -R . \
    | jq -s .
)"

jq -n \
  --arg timestamp "$(date -Iseconds)" \
  --arg cwd "$(pwd)" \
  --arg kernel "$(uname -r)" \
  --arg proc_version "$(cat /proc/version 2>/dev/null || true)" \
  --arg shell "${SHELL:-}" \
  --arg wsl_distro "${WSL_DISTRO_NAME:-}" \
  --arg wsl_interop "${WSL_INTEROP:-}" \
  --arg snap "${SNAP:-}" \
  --arg snap_name "${SNAP_NAME:-}" \
  --arg init_path "/init" \
  --arg hostfs_init_path "/var/lib/snapd/hostfs/init" \
  --arg winexec_path "$WINDOWS_BRIDGE_WINEXEC" \
  --arg failure_class "$failure_class" \
  --argjson init_exists "$(test -e /init && printf 'true' || printf 'false')" \
  --argjson hostfs_init_exists "$(test -e /var/lib/snapd/hostfs/init && printf 'true' || printf 'false')" \
  --argjson winexec_exists "$(test -e "$WINDOWS_BRIDGE_WINEXEC" && printf 'true' || printf 'false')" \
  --argjson probe "$probe_json" \
  --argjson helper_status "$helper_status_json" \
  --argjson direct_probe "$direct_probe_json" \
  --argjson winexec_probe "$winexec_probe_json" \
  --argjson run_wsl_sockets "$run_wsl_sockets_json" \
  '{
    timestamp: $timestamp,
    environment: {
      cwd: $cwd,
      shell: $shell,
      kernel: $kernel,
      proc_version: $proc_version,
      wsl_distro: $wsl_distro,
      wsl_interop: $wsl_interop,
      snap: $snap,
      snap_name: $snap_name
    },
    launchers: {
      init_path: $init_path,
      init_exists: $init_exists,
      hostfs_init_path: $hostfs_init_path,
      hostfs_init_exists: $hostfs_init_exists,
      winexec_path: $winexec_path,
      winexec_exists: $winexec_exists
    },
    run_wsl_sockets: $run_wsl_sockets,
    direct_probe: $direct_probe,
    winexec_probe: $winexec_probe,
    helper_status: $helper_status,
    probe: $probe,
    failure_class: $failure_class
  }'
