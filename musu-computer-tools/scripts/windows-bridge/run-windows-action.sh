#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

usage() {
  cat <<'EOF'
Usage: run-windows-action.sh --direct-script /abs/path.ps1 --working-dir /abs/path [options] [-- args...]

Options:
  --display-name NAME       Friendly action label
  --direct-script PATH      Script used for direct interop mode
  --direct-kind KIND        Direct mode kind (default: powershell_file)
  --helper-script PATH      Script used for helper queue mode
  --helper-kind KIND        Helper mode kind (default: direct kind)
  --manual-script PATH      Windows one-shot launcher path for manual fallback
  --working-dir PATH        Working directory for all requests
  --timeout-sec N           Helper wait timeout in seconds (default: 1800)
  --force-direct            Force direct mode
  --force-helper            Force helper mode
  --help                    Show this help
EOF
}

format_powershell_cli_argument() {
  local argument="$1"

  if [[ "$argument" =~ ^-[A-Za-z][A-Za-z0-9_-]*$ ]]; then
    printf '%s' "$argument"
    return
  fi

  argument="${argument//\'/\'\'}"
  printf "'%s'" "$argument"
}

mode_override=""
timeout_sec=1800
display_name=""
working_dir=""
direct_script=""
direct_kind="powershell_file"
helper_script=""
helper_kind=""
manual_script=""
direct_retries="${WINDOWS_BRIDGE_DIRECT_RETRIES:-3}"

write_audit_event() {
  local event_type="$1"
  local status="$2"
  local message="$3"
  local selected_mode_value="${4:-$selected_mode}"
  local reason_value="${5:-}"

  windows_bridge::ensure_runtime_dirs

  jq -nc \
    --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg event_type "$event_type" \
    --arg status "$status" \
    --arg action "$display_name" \
    --arg selected_mode "$selected_mode_value" \
    --arg reason "$reason_value" \
    --arg message "$message" \
    --arg direct_script "$direct_script" \
    --arg direct_kind "$direct_kind" \
    --arg direct_entrypoint_type "$direct_entrypoint_type" \
    --arg helper_script "$helper_script" \
    --arg helper_kind "$helper_kind" \
    --arg helper_entrypoint_type "$helper_entrypoint_type" \
    --arg manual_script "$manual_script" \
    --arg manual_entrypoint_type "$manual_entrypoint_type" \
    --arg mode_override "$mode_override" \
    '{
      timestamp: $timestamp,
      event_type: $event_type,
      status: $status,
      action: $action,
      selected_mode: $selected_mode,
      mode_override: $mode_override,
      resolution_reason: $reason,
      message: $message,
      direct: {
        script: $direct_script,
        kind: $direct_kind,
        entrypoint_type: $direct_entrypoint_type
      },
      helper: {
        script: $helper_script,
        kind: $helper_kind,
        entrypoint_type: $helper_entrypoint_type
      },
      manual: {
        script: $manual_script,
        entrypoint_type: $manual_entrypoint_type
      }
    }' >> "$(windows_bridge::audit_log_path)"
}

fail_policy() {
  local message="$1"
  local reason="$2"
  write_audit_event "policy_rejected" "failed" "$message" "$selected_mode" "$reason"
  echo "$message" >&2
  exit 2
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --display-name)
      display_name="$2"
      shift 2
      ;;
    --direct-script)
      direct_script="$2"
      shift 2
      ;;
    --direct-kind)
      direct_kind="$2"
      shift 2
      ;;
    --helper-script)
      helper_script="$2"
      shift 2
      ;;
    --helper-kind)
      helper_kind="$2"
      shift 2
      ;;
    --manual-script)
      manual_script="$2"
      shift 2
      ;;
    --working-dir)
      working_dir="$2"
      shift 2
      ;;
    --timeout-sec)
      timeout_sec="$2"
      shift 2
      ;;
    --direct-retries)
      direct_retries="$2"
      shift 2
      ;;
    --force-direct)
      mode_override="direct"
      shift
      ;;
    --force-helper)
      mode_override="helper"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

forward_args=("$@")

if [ -z "$direct_script" ] || [ -z "$working_dir" ]; then
  usage >&2
  exit 2
fi

direct_script="$(windows_bridge::abspath "$direct_script")"
working_dir="$(windows_bridge::abspath "$working_dir")"

if [ -n "$helper_script" ]; then
  helper_script="$(windows_bridge::abspath "$helper_script")"
else
  helper_script="$direct_script"
fi

if [ -n "$manual_script" ]; then
  manual_script="$(windows_bridge::abspath "$manual_script")"
fi

direct_entrypoint_type="$(windows_bridge::entrypoint_type "$direct_script")"
helper_entrypoint_type="$(windows_bridge::entrypoint_type "$helper_script")"
manual_entrypoint_type="$(windows_bridge::entrypoint_type "$manual_script")"

if [ -z "$helper_kind" ]; then
  helper_kind="$(windows_bridge::request_kind_for_path "$helper_script" 2>/dev/null || printf '%s' "$direct_kind")"
fi

if [ -z "$display_name" ]; then
  display_name="$(basename "$direct_script")"
fi

probe_json=""
selected_mode="$mode_override"

if [ -z "$selected_mode" ]; then
  probe_json="$("$SCRIPT_DIR/probe-interop.sh")"
  selected_mode="$(printf '%s\n' "$probe_json" | jq -r '.recommended_mode')"
fi

case "$direct_entrypoint_type" in
  powershell_script)
    ;;
  *)
    fail_policy \
      "Direct mode requires a PowerShell entrypoint, but '$direct_script' is classified as '$direct_entrypoint_type'." \
      "direct_requires_powershell_entrypoint"
    ;;
esac

case "$helper_kind:$helper_entrypoint_type" in
  powershell_file:powershell_script|cmd_file:cmd_wrapper|cmd_file:batch_wrapper)
    ;;
  *)
    fail_policy \
      "Helper kind '$helper_kind' does not match helper entrypoint '$helper_script' classified as '$helper_entrypoint_type'." \
      "helper_kind_entrypoint_mismatch"
    ;;
esac

case "$manual_entrypoint_type" in
  unknown)
    ;;
  cmd_wrapper|batch_wrapper)
    manual_resolution_reason="raw_wrapper_manual_only"
    ;;
  powershell_script)
    manual_resolution_reason="powershell_manual_entrypoint"
    ;;
  *)
    manual_resolution_reason="manual_entrypoint_other"
    ;;
esac

run_direct() {
  case "$direct_kind" in
    powershell_file)
      local direct_windows_path
      local direct_working_dir_windows
      local command_text
      local argument

      direct_windows_path="$(windows_bridge::linux_path_to_windows "$direct_script")"
      direct_working_dir_windows="$(windows_bridge::linux_path_to_windows "$working_dir")"
      command_text="Set-Location -LiteralPath '$direct_working_dir_windows'; & '$direct_windows_path'"
      for argument in "${forward_args[@]}"; do
        command_text+=" $(format_powershell_cli_argument "$argument")"
      done

      "$WINDOWS_BRIDGE_WINEXEC" \
        "$WINDOWS_BRIDGE_WINDOWS_POWERSHELL" \
        -NoProfile \
        -ExecutionPolicy Bypass \
        -Command "$command_text"
      ;;
    *)
      echo "Unsupported direct kind: $direct_kind" >&2
      echo "Use a PowerShell entrypoint for direct interop mode." >&2
      return 2
      ;;
  esac
}

run_helper() {
  local helper_reason="${1:-helper_reliability_path}"
  write_audit_event "resolution_selected" "pending" "Dispatching helper queue request." "helper" "$helper_reason"

  exec "$SCRIPT_DIR/enqueue-powershell.sh" \
    --kind "$helper_kind" \
    --script "$helper_script" \
    --working-dir "$working_dir" \
    --display-name "$display_name" \
    --execution-surface "helper_queue" \
    --resolution-reason "$helper_reason" \
    --entrypoint-type "$helper_entrypoint_type" \
    --timeout-sec "$timeout_sec" \
    -- "${forward_args[@]}"
}

print_manual_guidance() {
  if [ -z "$probe_json" ]; then
    probe_json="$("$SCRIPT_DIR/probe-interop.sh")"
  fi

  echo "Windows bridge helper is not available from this WSL session." >&2
  printf 'Action: %s\n' "$display_name" >&2
  write_audit_event "manual_guidance" "required" "Helper unavailable; manual Windows execution required." "manual" "${manual_resolution_reason:-manual_fallback}"

  start_helper_windows_path="$(printf '%s\n' "$probe_json" | jq -r '.actions.start_helper_windows_path // empty')"
  if [ -n "$start_helper_windows_path" ]; then
    echo "Start helper on Windows:" >&2
    printf '  %s\n' "$start_helper_windows_path" >&2
  fi

  if [ -n "$manual_script" ]; then
    manual_windows_path="$(windows_bridge::linux_path_to_windows "$manual_script")"
    echo "Run the one-shot launcher on Windows:" >&2
    printf '  %s\n' "$manual_windows_path" >&2
  else
    direct_windows_path="$(windows_bridge::linux_path_to_windows "$direct_script")"
    echo "Run the direct PowerShell entrypoint on Windows:" >&2
    printf '  %s\n' "$direct_windows_path" >&2
  fi
}

case "$selected_mode" in
  direct)
    write_audit_event "resolution_selected" "pending" "Attempting direct PowerShell interop fast path." "direct" "direct_fast_path"
    attempt=1
    while [ "$attempt" -le "$direct_retries" ]; do
      if run_direct; then
        write_audit_event "resolution_completed" "success" "Direct PowerShell interop succeeded." "direct" "direct_fast_path"
        exit 0
      else
        rc=$?
        write_audit_event "resolution_attempt_failed" "failed" "Direct PowerShell interop attempt failed." "direct" "direct_fast_path"
      fi

      if [ "$attempt" -lt "$direct_retries" ]; then
        echo "Direct Windows interop failed for $display_name (attempt $attempt/$direct_retries). Retrying..." >&2
        sleep 1
      fi
      attempt=$((attempt + 1))
    done

    if [ "$mode_override" = "direct" ]; then
      exit "${rc:-1}"
    fi

    if [ -z "$probe_json" ]; then
      probe_json="$("$SCRIPT_DIR/probe-interop.sh")"
    fi
    helper_status="$(printf '%s\n' "$probe_json" | jq -r '.helper.status // "offline"')"
    if [ "$helper_status" = "online" ]; then
      echo "Direct Windows interop kept failing for $display_name. Falling back to helper queue." >&2
      write_audit_event "resolution_fallback" "pending" "Direct interop failed; falling back to helper queue." "helper" "direct_failed_helper_online"
      run_helper "direct_failed_helper_online"
    fi

    print_manual_guidance
    exit "${rc:-1}"
    ;;
  helper)
    run_helper "helper_forced_or_probe_selected"
    ;;
  manual)
    write_audit_event "resolution_selected" "required" "Probe selected manual recovery path." "manual" "${manual_resolution_reason:-manual_probe_selected}"
    print_manual_guidance
    exit 2
    ;;
  *)
    echo "Unsupported mode: $selected_mode" >&2
    exit 2
    ;;
esac
