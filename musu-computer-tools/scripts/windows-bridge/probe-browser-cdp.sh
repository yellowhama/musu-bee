#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

usage() {
  cat <<'EOF'
Usage: probe-browser-cdp.sh [options]

Options:
  --host HOST               Probe a specific host. May be repeated.
  --port PORT               CDP port (default: 9222)
  --timeout-sec N           Per-request timeout in seconds (default: 2)
  --version-path PATH       Version endpoint path (default: /json/version)
  --list-path PATH          Target list endpoint path (default: /json/list)
  --include-resolv-host     Include /etc/resolv.conf nameserver as a candidate host
  --help                    Show this help
EOF
}

port=9222
timeout_sec=2
version_path="/json/version"
list_path="/json/list"
include_resolv_host=0
declare -a hosts=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --host)
      hosts+=("$2")
      shift 2
      ;;
    --port)
      port="$2"
      shift 2
      ;;
    --timeout-sec)
      timeout_sec="$2"
      shift 2
      ;;
    --version-path)
      version_path="$2"
      shift 2
      ;;
    --list-path)
      list_path="$2"
      shift 2
      ;;
    --include-resolv-host)
      include_resolv_host=1
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

if ! [[ "$port" =~ ^[0-9]+$ ]] || [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
  echo "Invalid port: $port" >&2
  exit 2
fi

if ! [[ "$timeout_sec" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
  echo "Invalid timeout: $timeout_sec" >&2
  exit 2
fi

if [ "${#hosts[@]}" -eq 0 ]; then
  hosts=("127.0.0.1" "localhost")
fi

if [ "$include_resolv_host" -eq 1 ] && [ -f /etc/resolv.conf ]; then
  resolv_host="$(awk '/^nameserver / {print $2; exit}' /etc/resolv.conf || true)"
  if [ -n "${resolv_host:-}" ]; then
    hosts+=("$resolv_host")
  fi
fi

declare -A seen_hosts=()
declare -a candidate_hosts=()
for host in "${hosts[@]}"; do
  if [ -n "$host" ] && [ -z "${seen_hosts[$host]:-}" ]; then
    seen_hosts["$host"]=1
    candidate_hosts+=("$host")
  fi
done

fetch_endpoint() {
  local url="$1"
  local body_file="$2"
  if command -v curl >/dev/null 2>&1; then
    local curl_stderr
    curl_stderr="$(mktemp)"
    local http_code="000"
    local transport_exit_code=0

    if ! http_code="$(curl -sS --max-time "$timeout_sec" -o "$body_file" -w '%{http_code}' "$url" 2>"$curl_stderr")"; then
      transport_exit_code=$?
    fi

    local stderr_text=""
    if [ -s "$curl_stderr" ]; then
      stderr_text="$(cat "$curl_stderr")"
    fi
    rm -f "$curl_stderr"

    jq -nc \
      --arg url "$url" \
      --arg http_code "$http_code" \
      --arg stderr "$stderr_text" \
      --arg client "curl" \
      --argjson transport_exit_code "$transport_exit_code" \
      '{
        url: $url,
        http_code: ($http_code | tonumber? // 0),
        transport_exit_code: $transport_exit_code,
        transport_client: $client,
        error: $stderr
      }'
    return
  fi

  python3 - "$url" "$timeout_sec" "$body_file" <<'PY'
import json
import socket
import sys
import urllib.error
import urllib.request

url = sys.argv[1]
timeout = float(sys.argv[2])
body_file = sys.argv[3]

result = {
    "url": url,
    "http_code": 0,
    "transport_exit_code": 0,
    "transport_client": "python_urllib",
    "error": "",
}

try:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        body = response.read()
        with open(body_file, "wb") as handle:
            handle.write(body)
        result["http_code"] = int(getattr(response, "status", 200) or 200)
except urllib.error.HTTPError as exc:
    body = exc.read()
    with open(body_file, "wb") as handle:
        handle.write(body)
    result["http_code"] = int(exc.code)
    result["error"] = str(exc)
except (urllib.error.URLError, socket.timeout, TimeoutError) as exc:
    result["transport_exit_code"] = 1
    result["error"] = str(exc)
except Exception as exc:  # pragma: no cover - defensive wrapper
    result["transport_exit_code"] = 1
    result["error"] = str(exc)

print(json.dumps(result))
PY
}

selected_result=""
selected_host=""
selected_version_body=""
selected_list_body=""
selected_version_error=""
selected_list_error=""
selected_base_url=""
endpoints_json="[]"

for host in "${candidate_hosts[@]}"; do
  base_url="http://${host}:${port}"
  version_url="${base_url}${version_path}"
  list_url="${base_url}${list_path}"
  version_body_file="$(mktemp)"
  list_body_file="$(mktemp)"

  version_meta="$(fetch_endpoint "$version_url" "$version_body_file")"
  version_http_code="$(printf '%s' "$version_meta" | jq -r '.http_code')"
  version_transport_exit_code="$(printf '%s' "$version_meta" | jq -r '.transport_exit_code')"
  version_transport_client="$(printf '%s' "$version_meta" | jq -r '.transport_client')"
  version_error="$(printf '%s' "$version_meta" | jq -r '.error')"

  list_meta="$(fetch_endpoint "$list_url" "$list_body_file")"
  list_http_code="$(printf '%s' "$list_meta" | jq -r '.http_code')"
  list_transport_exit_code="$(printf '%s' "$list_meta" | jq -r '.transport_exit_code')"
  list_transport_client="$(printf '%s' "$list_meta" | jq -r '.transport_client')"
  list_error="$(printf '%s' "$list_meta" | jq -r '.error')"

  version_body="$(cat "$version_body_file" 2>/dev/null || true)"
  list_body="$(cat "$list_body_file" 2>/dev/null || true)"
  rm -f "$version_body_file" "$list_body_file"

  reachable="false"
  if [ "$version_transport_exit_code" -eq 0 ] && [ "$version_http_code" -eq 200 ]; then
    reachable="true"
  fi

  endpoint_json="$(jq -nc \
    --arg host "$host" \
    --arg base_url "$base_url" \
    --argjson reachable "$reachable" \
    --argjson version_http_code "$version_http_code" \
    --argjson list_http_code "$list_http_code" \
    --argjson version_transport_exit_code "$version_transport_exit_code" \
    --argjson list_transport_exit_code "$list_transport_exit_code" \
    --arg version_transport_client "$version_transport_client" \
    --arg list_transport_client "$list_transport_client" \
    --arg version_error "$version_error" \
    --arg list_error "$list_error" \
    '{
      host: $host,
      base_url: $base_url,
      reachable: $reachable,
      version_http_code: $version_http_code,
      version_transport_exit_code: $version_transport_exit_code,
      version_transport_client: $version_transport_client,
      version_error: $version_error,
      list_http_code: $list_http_code,
      list_transport_exit_code: $list_transport_exit_code,
      list_transport_client: $list_transport_client,
      list_error: $list_error
    }')"
  endpoints_json="$(jq -nc --argjson items "$endpoints_json" --argjson item "$endpoint_json" '$items + [$item]')"

  if [ -z "$selected_result" ] && [ "$reachable" = "true" ]; then
    selected_result="$endpoint_json"
    selected_host="$host"
    selected_version_body="$version_body"
    selected_list_body="$list_body"
    selected_version_error="$version_error"
    selected_list_error="$list_error"
    selected_base_url="$base_url"
  fi
done

probe_meta="$(jq -nc \
  --argjson port "$port" \
  --argjson timeout_sec "$timeout_sec" \
  --arg version_path "$version_path" \
  --arg list_path "$list_path" \
  --argjson candidate_hosts "$(printf '%s\0' "${candidate_hosts[@]}" | jq -Rs 'split("\u0000")[:-1]')" \
  '{
    port: $port,
    timeout_sec: $timeout_sec,
    version_path: $version_path,
    list_path: $list_path,
    candidate_hosts: $candidate_hosts
  }')"

if [ -z "$selected_result" ]; then
  jq -n \
    --arg status "unreachable" \
    --arg recommended_next_action "Start a Windows browser with --remote-debugging-port or expose a reachable CDP endpoint." \
    --arg classification "network-bound-browser" \
    --arg control_plane "wsl_probe" \
    --argjson probe "$probe_meta" \
    --argjson endpoints "$endpoints_json" \
    '{
      status: $status,
      classification: $classification,
      control_plane: $control_plane,
      recommended_next_action: $recommended_next_action,
      probe: $probe,
      endpoints: $endpoints
    }'
  exit 1
fi

browser_json="$(printf '%s' "$selected_version_body" | jq -c '.' 2>/dev/null || printf '{}')"
targets_json="$(printf '%s' "$selected_list_body" | jq -c '.' 2>/dev/null || printf '[]')"
target_count="$(printf '%s' "$targets_json" | jq 'length')"
target_summary="$(printf '%s' "$targets_json" | jq '[.[] | {
  id: (.id // ""),
  type: (.type // ""),
  title: (.title // ""),
  url: (.url // ""),
  webSocketDebuggerUrl: (.webSocketDebuggerUrl // "")
}]')"

jq -n \
  --arg status "reachable" \
  --arg classification "network-bound-browser" \
  --arg control_plane "wsl_probe" \
  --arg selected_host "$selected_host" \
  --arg selected_base_url "$selected_base_url" \
  --arg browser_name "$(printf '%s' "$browser_json" | jq -r '.Browser // empty')" \
  --arg protocol_version "$(printf '%s' "$browser_json" | jq -r '."Protocol-Version" // empty')" \
  --arg websocket_debugger_url "$(printf '%s' "$browser_json" | jq -r '.webSocketDebuggerUrl // empty')" \
  --arg recommended_next_action "Use the reachable CDP endpoint instead of treating browser work as a Windows spawn problem." \
  --argjson probe "$probe_meta" \
  --argjson endpoints "$endpoints_json" \
  --argjson browser "$browser_json" \
  --argjson target_count "$target_count" \
  --argjson targets "$target_summary" \
  '{
    status: $status,
    classification: $classification,
    control_plane: $control_plane,
    selected_host: $selected_host,
    selected_base_url: $selected_base_url,
    browser_name: $browser_name,
    protocol_version: $protocol_version,
    websocket_debugger_url: $websocket_debugger_url,
    recommended_next_action: $recommended_next_action,
    probe: $probe,
    endpoints: $endpoints,
    browser: $browser,
    target_count: $target_count,
    targets: $targets
  }'
