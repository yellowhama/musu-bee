#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

windows_bridge::ensure_runtime_dirs

heartbeat_path="$(windows_bridge::heartbeat_path)"
install_state_path="$(windows_bridge::install_state_path)"
helper_state="offline"
helper_last_seen=""
helper_pid_json="null"
helper_host=""
helper_age_seconds_json="null"
recommended_action="start"
install_state="unknown"
install_state_source="none"
install_checked_at=""
task_name=""
task_installed_json="null"
startup_launcher_path=""
startup_launcher_exists_json="null"
service_launcher_path=""
service_launcher_exists_json="null"

if [ -f "$heartbeat_path" ]; then
  helper_last_seen="$(jq -r '.last_seen // empty' "$heartbeat_path" 2>/dev/null || true)"
  helper_host="$(jq -r '.host // empty' "$heartbeat_path" 2>/dev/null || true)"
  helper_pid_raw="$(jq -r '.pid // empty' "$heartbeat_path" 2>/dev/null || true)"
  helper_age_seconds=$(( $(date +%s) - $(stat -c %Y "$heartbeat_path") ))
  helper_age_seconds_json="$helper_age_seconds"

  if [[ "$helper_pid_raw" =~ ^[0-9]+$ ]]; then
    helper_pid_json="$helper_pid_raw"
  fi

  if [ "$helper_age_seconds" -le 15 ]; then
    helper_state="online"
    recommended_action="none"
  else
    helper_state="stale"
    recommended_action="restart"
  fi
fi

if [ -f "$install_state_path" ]; then
  install_state="$(jq -r '.install_state // "unknown"' "$install_state_path" 2>/dev/null || printf 'unknown')"
  install_checked_at="$(jq -r '.checked_at // empty' "$install_state_path" 2>/dev/null || true)"
  task_name="$(jq -r '.task_name // empty' "$install_state_path" 2>/dev/null || true)"
  startup_launcher_path="$(jq -r '.startup_launcher_path // empty' "$install_state_path" 2>/dev/null || true)"
  service_launcher_path="$(jq -r '.service_launcher_path // empty' "$install_state_path" 2>/dev/null || true)"

  install_state_source="cached"

  task_installed_raw="$(jq -r '.task_installed // empty' "$install_state_path" 2>/dev/null || true)"
  if [ "$task_installed_raw" = "true" ] || [ "$task_installed_raw" = "false" ]; then
    task_installed_json="$task_installed_raw"
  fi

  startup_launcher_exists_raw="$(jq -r '.startup_launcher_exists // empty' "$install_state_path" 2>/dev/null || true)"
  if [ "$startup_launcher_exists_raw" = "true" ] || [ "$startup_launcher_exists_raw" = "false" ]; then
    startup_launcher_exists_json="$startup_launcher_exists_raw"
  fi

  service_launcher_exists_raw="$(jq -r '.service_launcher_exists // empty' "$install_state_path" 2>/dev/null || true)"
  if [ "$service_launcher_exists_raw" = "true" ] || [ "$service_launcher_exists_raw" = "false" ]; then
    service_launcher_exists_json="$service_launcher_exists_raw"
  fi
fi

if [ "$helper_state" = "online" ]; then
  recommended_action="none"
elif [ "$helper_state" = "stale" ]; then
  recommended_action="restart"
else
  case "$install_state" in
    scheduled-task|startup-folder|manual)
      recommended_action="start"
      ;;
    not-installed)
      recommended_action="install"
      ;;
    *)
      recommended_action="status"
      ;;
  esac
fi

jq -n \
  --arg state "$helper_state" \
  --arg runtime_state "$helper_state" \
  --arg last_seen "$helper_last_seen" \
  --arg host "$helper_host" \
  --arg heartbeat_path "$heartbeat_path" \
  --arg install_state "$install_state" \
  --arg install_state_source "$install_state_source" \
  --arg install_state_path "$install_state_path" \
  --arg install_checked_at "$install_checked_at" \
  --arg task_name "$task_name" \
  --arg startup_launcher_path "$startup_launcher_path" \
  --arg service_launcher_path "$service_launcher_path" \
  --arg queue_path "$WINDOWS_BRIDGE_QUEUE" \
  --arg processing_path "$WINDOWS_BRIDGE_PROCESSING" \
  --arg results_path "$WINDOWS_BRIDGE_RESULTS" \
  --arg logs_path "$WINDOWS_BRIDGE_LOGS" \
  --arg recommended_action "$recommended_action" \
  --argjson pid "$helper_pid_json" \
  --argjson age_seconds "$helper_age_seconds_json" \
  --argjson task_installed "$task_installed_json" \
  --argjson startup_launcher_exists "$startup_launcher_exists_json" \
  --argjson service_launcher_exists "$service_launcher_exists_json" \
  --argjson queue_count "$(find "$WINDOWS_BRIDGE_QUEUE" -maxdepth 1 -type f | wc -l)" \
  --argjson processing_count "$(find "$WINDOWS_BRIDGE_PROCESSING" -maxdepth 1 -type f | wc -l)" \
  --argjson result_count "$(find "$WINDOWS_BRIDGE_RESULTS" -maxdepth 1 -type f | wc -l)" \
  --argjson log_count "$(find "$WINDOWS_BRIDGE_LOGS" -maxdepth 1 -type f | wc -l)" \
  '{
    state: $state,
    runtime_state: $runtime_state,
    install_state: $install_state,
    install_state_source: $install_state_source,
    pid: $pid,
    host: $host,
    last_seen: $last_seen,
    age_seconds: $age_seconds,
    heartbeat_path: $heartbeat_path,
    install_state_path: $install_state_path,
    install_checked_at: $install_checked_at,
    task_name: $task_name,
    task_installed: $task_installed,
    startup_launcher_path: $startup_launcher_path,
    startup_launcher_exists: $startup_launcher_exists,
    service_launcher_path: $service_launcher_path,
    service_launcher_exists: $service_launcher_exists,
    queue_path: $queue_path,
    processing_path: $processing_path,
    results_path: $results_path,
    logs_path: $logs_path,
    queue_count: $queue_count,
    processing_count: $processing_count,
    result_count: $result_count,
    log_count: $log_count,
    recommended_action: $recommended_action
  }'
