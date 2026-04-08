#!/usr/bin/env bash
set -euo pipefail

# MUS-995 remote readiness gate:
# Verifies that the remote musu-portd exposes chat HTTP + WS endpoints
# required by musu-bee's default /chat/ws/{channel} flow.

PORTD_BASE_URL="${1:-${MUSU_PORTD_BASE_URL:-http://100.121.211.106:1355}}"
CHANNEL="${2:-${MUSU_CHAT_CHANNEL:-ceo}}"
TIMEOUT_SEC="${MUSU_REMOTE_TIMEOUT_SEC:-8}"
REQUEST_ID="mus995-$(date +%s)"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

failures=()
warnings=()
status_alias_missing=false
chat_alias_missing=false

record_failure() {
  failures+=("$1")
}

record_warning() {
  warnings+=("$1")
}

curl_json() {
  local url="$1"
  local out="$2"
  curl -fsS --max-time "$TIMEOUT_SEC" "$url" >"$out"
}

echo "[MUS-995] remote chat gate"
echo "  PORTD_BASE_URL: $PORTD_BASE_URL"
echo "  CHANNEL:        $CHANNEL"
echo "  TIMEOUT_SEC:    $TIMEOUT_SEC"
echo

HEALTH_JSON="$TMP_DIR/health.json"
if curl_json "$PORTD_BASE_URL/health" "$HEALTH_JSON"; then
  route_count="$(jq -r '.route_count // "unknown"' "$HEALTH_JSON" 2>/dev/null || echo "unknown")"
  device_id="$(jq -r '.device_id // "unknown-device"' "$HEALTH_JSON" 2>/dev/null || echo "unknown-device")"
  physical_host_id="$(jq -r '.physical_host_id // empty' "$HEALTH_JSON" 2>/dev/null || echo "")"
  echo "[OK] /health reachable (route_count=$route_count, device_id=$device_id)"
  if [[ -z "$physical_host_id" ]]; then
    record_warning "/health missing physical_host_id (mesh grouping can drift across WSL/Windows)"
  fi
else
  record_failure "/health unreachable on remote musu-portd"
fi

ROUTES_JSON="$TMP_DIR/routes.json"
if curl_json "$PORTD_BASE_URL/routes" "$ROUTES_JSON"; then
  alias_csv="$(jq -r 'map(.alias) | join(",")' "$ROUTES_JSON" 2>/dev/null || echo "")"
  echo "[OK] /routes reachable (aliases=$alias_csv)"
else
  record_failure "/routes unreachable on remote musu-portd"
fi

STATUS_BODY="$TMP_DIR/status_body.txt"
status_http_code="$(curl -sS --max-time "$TIMEOUT_SEC" \
  -o "$STATUS_BODY" \
  -w '%{http_code}' \
  "$PORTD_BASE_URL/status" || true)"

if [[ "$status_http_code" == "200" ]]; then
  status_device_id="$(jq -r '.device_id // "unknown-device"' "$STATUS_BODY" 2>/dev/null || echo "unknown-device")"
  status_physical_host_id="$(jq -r '.physical_host_id // empty' "$STATUS_BODY" 2>/dev/null || echo "")"
  echo "[OK] /status reachable (device_id=$status_device_id, physical_host_id=${status_physical_host_id:-missing})"
else
  status_body_preview="$(head -c 200 "$STATUS_BODY" 2>/dev/null || true)"
  record_warning "/status unavailable (HTTP $status_http_code, body='$status_body_preview')"
  if [[ "$status_http_code" == "404" && "$status_body_preview" == *"unknown service alias: status"* ]]; then
    status_alias_missing=true
  fi
fi

CHAT_BODY="$TMP_DIR/chat_body.txt"
chat_http_code="$(curl -sS --max-time "$TIMEOUT_SEC" \
  -o "$CHAT_BODY" \
  -w '%{http_code}' \
  -H 'Content-Type: application/json' \
  -d "{\"message\":\"MUS-995 smoke ping ($REQUEST_ID)\"}" \
  "$PORTD_BASE_URL/chat" || true)"

if [[ "$chat_http_code" == "200" ]]; then
  response_text="$(jq -r '.text // .response // empty' "$CHAT_BODY" 2>/dev/null || true)"
  if [[ -n "$response_text" ]]; then
    echo "[OK] POST /chat returned response text"
  else
    record_failure "POST /chat returned 200 but no text/response field"
  fi
else
  chat_body_preview="$(head -c 200 "$CHAT_BODY" 2>/dev/null || true)"
  record_failure "POST /chat failed (HTTP $chat_http_code, body='$chat_body_preview')"
  if [[ "$chat_http_code" == "404" && "$chat_body_preview" == *"unknown service alias: chat"* ]]; then
    chat_alias_missing=true
  fi
fi

WS_HEADER_FILE="$TMP_DIR/ws_headers.txt"
# Plain HTTP upgrade handshake via curl. A healthy chat WS endpoint should return HTTP 101.
curl -sS --http1.1 --max-time "$TIMEOUT_SEC" -D "$WS_HEADER_FILE" -o /dev/null \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  "$PORTD_BASE_URL/chat/ws/$CHANNEL" || true

ws_status_line="$(head -n 1 "$WS_HEADER_FILE" | tr -d '\r' || true)"
if [[ "$ws_status_line" == *" 101 "* ]]; then
  echo "[OK] WS handshake accepted on /chat/ws/$CHANNEL ($ws_status_line)"
else
  ws_body="$(curl -sS --max-time "$TIMEOUT_SEC" "$PORTD_BASE_URL/chat/ws/$CHANNEL" || true)"
  ws_body_preview="$(echo "$ws_body" | head -c 200)"
  record_failure "WS handshake failed on /chat/ws/$CHANNEL (status='${ws_status_line:-none}', body='$ws_body_preview')"
fi

if $status_alias_missing && $chat_alias_missing; then
  record_failure "remote musu-portd appears stale: dedicated /status and /chat routes are missing (falls through to alias router)"
fi

echo
if ((${#warnings[@]} > 0)); then
  echo "[WARNINGS]"
  for item in "${warnings[@]}"; do
    echo "  - $item"
  done
  echo
fi

if ((${#failures[@]} > 0)); then
  echo "[FAIL]"
  for item in "${failures[@]}"; do
    echo "  - $item"
  done
  exit 1
fi

echo "[PASS] Remote musu-portd satisfies MUS-995 chat HTTP+WS gate."
