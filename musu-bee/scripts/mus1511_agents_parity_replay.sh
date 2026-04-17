#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT_API="${PORT_API:-3301}"
PORT_PAPERCLIP="${PORT_PAPERCLIP:-33100}"
PORT_HANDOFF="${PORT_HANDOFF:-33155}"
TS_KST="$(TZ=Asia/Seoul date +%Y%m%dT%H%M%S%z)"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/../artifacts/mus1511-agents-parity-${TS_KST}}"
mkdir -p "$OUT_DIR"

PAPERCLIP_LOG="$OUT_DIR/mock-paperclip.log"
HANDOFF_LOG="$OUT_DIR/mock-handoff.log"
NEXT_LOG="$OUT_DIR/next-dev.log"
READ1_JSON="$OUT_DIR/read_1.json"
READ2_JSON="$OUT_DIR/read_2.json"
READ1_CANON="$OUT_DIR/read_1.canon.json"
READ2_CANON="$OUT_DIR/read_2.canon.json"
SUMMARY="$OUT_DIR/summary.txt"

PAPERCLIP_PID=""
HANDOFF_PID=""
NEXT_PID=""

cleanup() {
  set +e
  if [[ -n "${NEXT_PID}" ]] && kill -0 "${NEXT_PID}" 2>/dev/null; then
    kill "${NEXT_PID}" 2>/dev/null || true
    wait "${NEXT_PID}" 2>/dev/null || true
  fi
  if [[ -n "${HANDOFF_PID}" ]] && kill -0 "${HANDOFF_PID}" 2>/dev/null; then
    kill "${HANDOFF_PID}" 2>/dev/null || true
    wait "${HANDOFF_PID}" 2>/dev/null || true
  fi
  if [[ -n "${PAPERCLIP_PID}" ]] && kill -0 "${PAPERCLIP_PID}" 2>/dev/null; then
    kill "${PAPERCLIP_PID}" 2>/dev/null || true
    wait "${PAPERCLIP_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

{
  echo "timestamp_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "timestamp_kst=$(TZ=Asia/Seoul date +%Y-%m-%dT%H:%M:%S%z)"
  echo "port_api=${PORT_API}"
  echo "port_paperclip=${PORT_PAPERCLIP}"
  echo "port_handoff=${PORT_HANDOFF}"
  echo "out_dir=${OUT_DIR}"
} | tee "$SUMMARY"

echo "start_mock_paperclip=begin" | tee -a "$SUMMARY"
PORT="${PORT_PAPERCLIP}" node <<'NODE' >"$PAPERCLIP_LOG" 2>&1 &
const http = require('http');
const port = Number(process.env.PORT);
const agents = [
  {
    id: 'agent-1',
    name: 'CTO',
    role: 'cto',
    status: 'running',
    urlKey: 'cto',
    lastHeartbeatAt: new Date().toISOString(),
    adapter: { id: 'internal-adapter' },
    runtimeEnv: 'prod',
    instructions: 'internal_only'
  },
  {
    id: 'agent-2',
    name: 'QA Lead',
    role: 'qa',
    status: 'idle',
    urlKey: 'qa-lead',
    lastHeartbeatAt: new Date().toISOString()
  }
];
http.createServer((req, res) => {
  if (req.url === '/api/companies/company-test/agents') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(agents));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
}).listen(port, '127.0.0.1', () => {
  console.log(`mock paperclip listening on ${port}`);
});
NODE
PAPERCLIP_PID=$!

echo "start_mock_handoff=begin" | tee -a "$SUMMARY"
PORT="${PORT_HANDOFF}" node <<'NODE' >"$HANDOFF_LOG" 2>&1 &
const http = require('http');
const port = Number(process.env.PORT);
const payload = {
  available: true,
  recorded_at_ms: 12345,
  decision: {
    boss_host: 'ingress-beta',
    selected_target: 'device-b',
    decision_reason_code: 'resource_rule_remote_selected'
  }
};
http.createServer((req, res) => {
  if (req.url === '/handoff/latest') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
}).listen(port, '127.0.0.1', () => {
  console.log(`mock handoff listening on ${port}`);
});
NODE
HANDOFF_PID=$!

cd "$ROOT_DIR"
echo "start_next_dev=begin" | tee -a "$SUMMARY"
PAPERCLIP_API_URL="http://127.0.0.1:${PORT_PAPERCLIP}" \
PAPERCLIP_COMPANY_ID="company-test" \
MUSU_PORT_URL="http://127.0.0.1:${PORT_HANDOFF}" \
AGENTS_STALE_THRESHOLD_MS="600000" \
npx next dev -p "${PORT_API}" >"$NEXT_LOG" 2>&1 &
NEXT_PID=$!

for i in $(seq 1 90); do
  if curl -fsS "http://127.0.0.1:${PORT_API}/api/agents" >/dev/null 2>&1; then
    echo "next_ready_after_s=${i}" | tee -a "$SUMMARY"
    break
  fi
  sleep 1
  if [[ "$i" == "90" ]]; then
    echo "next_ready_after_s=timeout" | tee -a "$SUMMARY"
    echo "ERROR: next dev did not become ready" | tee -a "$SUMMARY"
    exit 1
  fi
done

curl -fsS "http://127.0.0.1:${PORT_API}/api/agents" | jq -S . >"$READ1_JSON"
curl -fsS "http://127.0.0.1:${PORT_API}/api/agents" | jq -S . >"$READ2_JSON"
jq -S 'del(.fetchedAt)' "$READ1_JSON" >"$READ1_CANON"
jq -S 'del(.fetchedAt)' "$READ2_JSON" >"$READ2_CANON"

if cmp -s "$READ1_CANON" "$READ2_CANON"; then
  echo "read_1=parity_ok" | tee -a "$SUMMARY"
  echo "read_2=parity_ok" | tee -a "$SUMMARY"
else
  echo "read_1=parity_mismatch" | tee -a "$SUMMARY"
  echo "read_2=parity_mismatch" | tee -a "$SUMMARY"
  diff -u "$READ1_CANON" "$READ2_CANON" >"$OUT_DIR/read_diff.patch" || true
  exit 1
fi

if jq -e 'has("snapshot") or any(.summary.departments[]?; has("adapter") or has("runtimeEnv") or has("instructions") or has("adapterConfig") or has("env"))' "$READ1_JSON" >/dev/null; then
  echo "metadata_leak_check=FAIL" | tee -a "$SUMMARY"
  exit 1
else
  echo "metadata_leak_check=PASS" | tee -a "$SUMMARY"
fi

echo "teardown_cmd_1=kill ${NEXT_PID}" | tee -a "$SUMMARY"
echo "teardown_cmd_2=kill ${HANDOFF_PID}" | tee -a "$SUMMARY"
echo "teardown_cmd_3=kill ${PAPERCLIP_PID}" | tee -a "$SUMMARY"

echo "overall=parity_ok" | tee -a "$SUMMARY"
