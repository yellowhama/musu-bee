#!/usr/bin/env bash
# read-cdp-consumer.sh — reference consumer for the browser CDP probe
#
# Wraps probe-browser-cdp.sh, interprets the output, and prints the
# actionable connection state.
#
# Exit codes:
#   0  — endpoint reachable (ready to connect)
#   1  — endpoint unreachable (launch needed)
#   2  — usage error

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROBE_SCRIPT="$SCRIPT_DIR/probe-browser-cdp.sh"

usage() {
  cat <<'EOF'
Usage: read-cdp-consumer.sh [options]

Options:
  --host HOST       CDP host to probe (passed to probe-browser-cdp.sh, may repeat)
  --port PORT       CDP port (default: 9222)
  --json            Print full JSON consumer result instead of plain status line
  --help            Show this help
EOF
}

json_output=0
declare -a probe_args=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --host)
      probe_args+=("--host" "$2")
      shift 2
      ;;
    --port)
      probe_args+=("--port" "$2")
      shift 2
      ;;
    --json)
      json_output=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

# Run probe; capture output; do NOT abort on non-zero exit (unreachable returns 1)
probe_result="$("$PROBE_SCRIPT" "${probe_args[@]}" 2>/dev/null || true)"

if [ -z "$probe_result" ]; then
  echo "ERROR: probe-browser-cdp.sh produced no output" >&2
  exit 2
fi

status="$(printf '%s' "$probe_result" | jq -r '.status // "unreachable"')"

if [ "$status" = "reachable" ]; then
  selected_base_url="$(printf '%s' "$probe_result" | jq -r '.selected_base_url // ""')"
  selected_host="$(printf '%s' "$probe_result" | jq -r '.selected_host // ""')"
  websocket_debugger_url="$(printf '%s' "$probe_result" | jq -r '.websocket_debugger_url // ""')"
  browser_name="$(printf '%s' "$probe_result" | jq -r '.browser_name // ""')"
  protocol_version="$(printf '%s' "$probe_result" | jq -r '.protocol_version // ""')"
  target_count="$(printf '%s' "$probe_result" | jq -r '.target_count // 0')"
  targets="$(printf '%s' "$probe_result" | jq -c '.targets // []')"

  if [ "$json_output" -eq 1 ]; then
    jq -n \
      --arg state "ready" \
      --arg selected_host "$selected_host" \
      --arg selected_base_url "$selected_base_url" \
      --arg websocket_debugger_url "$websocket_debugger_url" \
      --arg browser_name "$browser_name" \
      --arg protocol_version "$protocol_version" \
      --argjson target_count "$target_count" \
      --argjson targets "$targets" \
      '{
        state: $state,
        selected_host: $selected_host,
        selected_base_url: $selected_base_url,
        websocket_debugger_url: $websocket_debugger_url,
        browser_name: $browser_name,
        protocol_version: $protocol_version,
        target_count: $target_count,
        targets: $targets,
        recommended_next_action: "Attach to websocket_debugger_url (browser level) or a targets[].webSocketDebuggerUrl (per-tab)."
      }'
  else
    echo "state: ready"
    echo "host: $selected_host"
    echo "base_url: $selected_base_url"
    echo "browser: $browser_name"
    echo "targets: $target_count"
    if [ -n "$websocket_debugger_url" ]; then
      echo "ws_debugger_url: $websocket_debugger_url"
    fi
  fi

  exit 0

else
  # unreachable — launch needed
  recommended="$(printf '%s' "$probe_result" | jq -r '.recommended_next_action // "Start a Windows browser with --remote-debugging-port or expose a reachable CDP endpoint."')"

  if [ "$json_output" -eq 1 ]; then
    jq -n \
      --arg state "launch-needed" \
      --arg recommended_next_action "$recommended" \
      '{
        state: $state,
        selected_host: null,
        selected_base_url: null,
        websocket_debugger_url: null,
        recommended_next_action: $recommended_next_action
      }'
  else
    echo "state: launch-needed"
    echo "next: $recommended"
  fi

  exit 1
fi
