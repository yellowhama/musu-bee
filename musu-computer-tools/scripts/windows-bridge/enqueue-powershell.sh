#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

usage() {
  cat <<'EOF'
Usage: enqueue-powershell.sh --script /abs/path.ps1 [options] [-- args...]

Options:
  --kind KIND               Request kind: powershell_file or cmd_file
  --working-dir /abs/path   Working directory for the request
  --display-name NAME       Friendly request label
  --execution-surface NAME  Resolution surface label for audit/result metadata
  --resolution-reason TEXT  Why this resolution was selected
  --entrypoint-type TYPE    Classified entrypoint type for audit/result metadata
  --timeout-sec N           Wait timeout in seconds (default: 900)
  --no-wait                 Return after queueing without waiting for the result
EOF
}

windows_bridge::ensure_runtime_dirs

script_path=""
request_kind="powershell_file"
working_dir=""
display_name=""
execution_surface=""
resolution_reason=""
entrypoint_type=""
timeout_sec=900
wait_for_result=1

while [ "$#" -gt 0 ]; do
  case "$1" in
    --script)
      script_path="$2"
      shift 2
      ;;
    --kind)
      request_kind="$2"
      shift 2
      ;;
    --working-dir)
      working_dir="$2"
      shift 2
      ;;
    --display-name)
      display_name="$2"
      shift 2
      ;;
    --execution-surface)
      execution_surface="$2"
      shift 2
      ;;
    --resolution-reason)
      resolution_reason="$2"
      shift 2
      ;;
    --entrypoint-type)
      entrypoint_type="$2"
      shift 2
      ;;
    --timeout-sec)
      timeout_sec="$2"
      shift 2
      ;;
    --no-wait)
      wait_for_result=0
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
      break
      ;;
  esac
done

forward_args=("$@")

if [ -z "$script_path" ]; then
  usage >&2
  exit 2
fi

script_path="$(windows_bridge::abspath "$script_path")"

if [ -z "$working_dir" ]; then
  working_dir="$(dirname "$script_path")"
else
  working_dir="$(windows_bridge::abspath "$working_dir")"
fi

if [ -z "$display_name" ]; then
  display_name="$(basename "$script_path")"
fi

request_id="wb-$(date -u +%Y%m%dT%H%M%S)-$$-$RANDOM"
request_path="$WINDOWS_BRIDGE_QUEUE/$request_id.json"
request_tmp="$request_path.tmp"
result_path="$(windows_bridge::result_path "$request_id")"
arguments_json="$(windows_bridge::args_to_json "${forward_args[@]}")"

jq -n \
  --arg id "$request_id" \
  --arg kind "$request_kind" \
  --arg created_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg display_name "$display_name" \
  --arg execution_surface "$execution_surface" \
  --arg resolution_reason "$resolution_reason" \
  --arg entrypoint_type "$entrypoint_type" \
  --arg script_path "$script_path" \
  --arg working_directory "$working_dir" \
  --arg wsl_distro "${WSL_DISTRO_NAME:-Ubuntu-22.04}" \
  --arg source_repo "$WINDOWS_BRIDGE_REPO_ROOT" \
  --argjson arguments "$arguments_json" \
  '{
    version: 1,
    id: $id,
    kind: $kind,
    created_at: $created_at,
    display_name: $display_name,
    execution_surface: $execution_surface,
    resolution_reason: $resolution_reason,
    entrypoint_type: $entrypoint_type,
    script_path: $script_path,
    working_directory: $working_directory,
    wsl_distro: $wsl_distro,
    source_repo: $source_repo,
    arguments: $arguments
  }' > "$request_tmp"

mv "$request_tmp" "$request_path"

if [ "$wait_for_result" -eq 0 ]; then
  jq -n \
    --arg request_id "$request_id" \
    --arg request_path "$request_path" \
    --arg result_path "$result_path" \
    '{
      request_id: $request_id,
      request_path: $request_path,
      result_path: $result_path,
      status: "queued"
    }'
  exit 0
fi

deadline=$(( $(date +%s) + timeout_sec ))

while [ ! -f "$result_path" ]; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "Timed out waiting for Windows bridge result: $result_path" >&2
    exit 124
  fi
  sleep 1
done

cat "$result_path"

result_status="$(jq -r '.status // "failed"' "$result_path")"
result_exit_code="$(jq -r '.exit_code // 1' "$result_path")"

if [ "$result_status" = "success" ]; then
  exit 0
fi

if [[ "$result_exit_code" =~ ^[0-9]+$ ]]; then
  exit "$result_exit_code"
fi

exit 1
