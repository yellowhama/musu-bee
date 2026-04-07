#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEVICE_ID="${MUSU_DEVICE_ID:-real-mcp-smoke}"
MCP_SERVER="${MCP_SERVER:-}"
WORK_DIR="${MUSU_REAL_MCP_SMOKE_WORK_DIR:-$(mktemp -d)}"
PRESERVE_WORK_DIR="${MUSU_REAL_MCP_SMOKE_PRESERVE_WORK_DIR:-0}"
SUMMARY_PATH="${MUSU_REAL_MCP_SMOKE_SUMMARY_PATH:-}"

pick_free_port() {
  python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
}

PORT="${MUSU_PORT_MANAGER_PORT:-$(pick_free_port)}"
MCP_PORT="${MUSU_AS_MCP_PORT:-$(pick_free_port)}"

if [[ -z "${MCP_SERVER}" ]]; then
  if [[ -f "${ROOT_DIR}/../MUSU-AS-MCP/server.py" ]]; then
    MCP_SERVER="${ROOT_DIR}/../MUSU-AS-MCP/server.py"
  else
    echo "MCP server path not found. Set MCP_SERVER=/path/to/server.py" >&2
    exit 1
  fi
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required" >&2
  exit 1
fi

mkdir -p "${WORK_DIR}"
MCP_LOG="${WORK_DIR}/mcp.log"
PORT_LOG="${WORK_DIR}/musu-port.log"
PROFILE_PATH="${WORK_DIR}/device-profile.json"
SEED_PATH="${WORK_DIR}/seed-services.json"
SUCCESS=0

cleanup() {
  if [[ -n "${PORT_PID:-}" ]]; then
    kill "${PORT_PID}" >/dev/null 2>&1 || true
    wait "${PORT_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${MCP_PID:-}" ]]; then
    kill "${MCP_PID}" >/dev/null 2>&1 || true
    wait "${MCP_PID}" >/dev/null 2>&1 || true
  fi
  if [[ "${SUCCESS}" -eq 1 && "${PRESERVE_WORK_DIR}" != "1" ]]; then
    rm -rf "${WORK_DIR}"
  else
    echo "real-mcp-smoke artifacts preserved at ${WORK_DIR}" >&2
  fi
}
trap cleanup EXIT

cat > "${SEED_PATH}" <<JSON
[
  {
    "name": "validation-api",
    "alias": "validation-api",
    "enabled": true,
    "running": true,
    "port": 24910
  }
]
JSON

cat > "${PROFILE_PATH}" <<JSON
{
  "version": "musu.device-profile.v1",
  "device_id": "${DEVICE_ID}",
  "runtime_kind": "wsl",
  "filesystem_context": "linux_native",
  "launch": {
    "linux_command": "${ROOT_DIR}/target/debug/musu-portd",
    "wsl_command": "${ROOT_DIR}/target/debug/musu-portd"
  },
  "health": {
    "health_path": "/health",
    "mcp_health_path": "/mcp/health",
    "probe_timeout_ms": 250,
    "mcp_probe_mode": "health_then_deep",
    "mcp_rpc_paths": [
      "/mcp"
    ]
  },
  "transport": {
    "preferred_ingress": "http",
    "supports_connect": true,
    "supports_quic": true,
    "auto_promote_mcp": false
  },
  "validation": {
    "on_error": "warn"
  },
  "path_hints": {
    "linux_root": "${ROOT_DIR}"
  },
  "report_roots": {
    "metadata": "${WORK_DIR}/reports/metadata",
    "connect": "${WORK_DIR}/reports/connect"
  },
  "guidance": {
    "translator_hints": [
      "surface MCP alias instead of raw port"
    ]
  },
  "service_templates": [
    {
      "name": "real mcp smoke template",
      "service_class": "mcp_server",
      "alias": "musu-as-mcp",
      "health_path": "/mcp/health",
      "rpc_path": "/mcp",
      "tags": [
        "mcp",
        "ai-native"
      ],
      "agent_facing": true,
      "match_process_names": [
        "python3"
      ],
      "match_protocols": [
        "tcp"
      ],
      "match_ports": [
        ${MCP_PORT}
      ],
      "priority": 100
    }
  ]
}
JSON

if [[ ! -x "${ROOT_DIR}/target/debug/musu-portd" ]]; then
  (cd "${ROOT_DIR}" && ./scripts/linux-rust-env.sh cargo build -p musu-portd >/dev/null)
fi

MUSU_AS_MCP_PORT="${MCP_PORT}" python3 "${MCP_SERVER}" >"${MCP_LOG}" 2>&1 &
MCP_PID=$!

python3 - <<PY
import json, time, urllib.request, sys
port = int("${MCP_PORT}")
deadline = time.time() + 10
last_error = None
while time.time() < deadline:
    try:
        payload = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/mcp/health", timeout=0.5))
        if payload.get("ok"):
            sys.exit(0)
    except Exception as exc:
        last_error = exc
    time.sleep(0.2)
raise SystemExit(f"MCP server did not become healthy: {last_error}")
PY

(
  cd "${ROOT_DIR}" && \
  MUSU_PORT_MANAGER_PORT="${PORT}" \
  MUSU_PORT_MANAGER_ALLOW_FALLBACK=false \
  MUSU_PORT_SEED_SERVICES="${SEED_PATH}" \
  MUSU_PORT_DATA_ROOT="${WORK_DIR}/data" \
  MUSU_PORT_DISCOVERY_PROVIDER=linux \
  MUSU_DEVICE_ID="${DEVICE_ID}" \
  MUSU_DEVICE_PROFILE_PATH="${PROFILE_PATH}" \
  ./scripts/linux-rust-env.sh cargo run -p musu-portd
) >"${PORT_LOG}" 2>&1 &
PORT_PID=$!

python3 - <<PY
import json, time, urllib.request, urllib.error, sys
port = int("${PORT}")
deadline = time.time() + 20
last_error = None
while time.time() < deadline:
    try:
        payload = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=0.5))
        if payload.get("status") == "ok":
            sys.exit(0)
    except Exception as exc:
        last_error = exc
    time.sleep(0.25)
raise SystemExit(f"musu-port did not become healthy: {last_error}")
PY

export MUSU_PORT_MANAGER_PORT="${PORT}"
export MUSU_AS_MCP_PORT="${MCP_PORT}"
export MUSU_REAL_MCP_SMOKE_SUMMARY_PATH="${SUMMARY_PATH}"
python3 - <<'PY'
import json
import os
import time
import urllib.request

port = int(os.environ["MUSU_PORT_MANAGER_PORT"])
mcp_port = int(os.environ["MUSU_AS_MCP_PORT"])

def get_json(url: str):
    print(f"[real-mcp-smoke] GET {url}", file=os.sys.stderr)
    with urllib.request.urlopen(url, timeout=10) as resp:
        return json.load(resp)

def post_json(url: str, payload: dict):
    print(f"[real-mcp-smoke] POST {url} method={payload.get('method', '') or payload}", file=os.sys.stderr)
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.load(resp)

raw_health = get_json(f"http://127.0.0.1:{mcp_port}/mcp/health")
raw_initialize = post_json(
    f"http://127.0.0.1:{mcp_port}/mcp",
    {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
)
raw_tools = post_json(
    f"http://127.0.0.1:{mcp_port}/mcp",
    {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
)

health = get_json(f"http://127.0.0.1:{port}/health")
deadline = time.time() + 20
target = None
while time.time() < deadline:
    discovery = get_json(f"http://127.0.0.1:{port}/discovery")
    if isinstance(discovery, dict):
        endpoints = discovery.get("endpoints", [])
    else:
        endpoints = discovery
    for item in endpoints:
        if item.get("port") == mcp_port:
            target = item
            break
    if target is not None:
        break
    time.sleep(0.5)

if target is None:
    raise SystemExit("mcp endpoint not found in discovery after waiting")

promoted = post_json(
    f"http://127.0.0.1:{port}/promote",
    {"signature": target["signature"], "alias": "musu-as-mcp", "protocol": "http"},
)
post_json(f"http://127.0.0.1:{port}/connect/mode", {"mode": "preview"})
connect = get_json(f"http://127.0.0.1:{port}/connect/musu-as-mcp")
audit_events = get_json(f"http://127.0.0.1:{port}/audit/events")
if isinstance(audit_events, dict):
    events = audit_events.get("events", [])
else:
    events = audit_events

summary = {
    "raw_mcp": {
        "health_ok": bool(raw_health.get("ok")),
        "initialize_has_result": "result" in raw_initialize,
        "tools_has_result": "result" in raw_tools,
        "tool_count": len(raw_tools.get("result", {}).get("tools", [])),
    },
    "port_manager": {
        "device_profile_loaded": health.get("device_profile_loaded"),
        "device_profile_validation_action": health.get("device_profile_validation_action"),
        "discovery": {
            "signature": target.get("signature"),
            "protocol": target.get("protocol"),
            "service_class": target.get("service_class"),
            "agent_facing": target.get("agent_facing"),
            "classification_source": target.get("classification_source"),
            "process_name": target.get("process_name"),
            "process_user": target.get("process_user"),
            "pid": target.get("pid"),
            "listen_addr": target.get("listen_addr"),
            "port": target.get("port"),
            "exposure": target.get("exposure"),
            "owner": target.get("owner"),
            "severity": target.get("severity"),
            "false_positive_candidate": target.get("false_positive_candidate"),
            "ignored": target.get("ignored"),
            "suggested_alias": target.get("suggested_alias"),
            "suggested_action": target.get("suggested_action"),
        },
        "promoted": promoted,
        "connect": connect,
        "promote_audit_found": any(
            event.get("event_type") == "promote" and event.get("route_alias") == "musu-as-mcp"
            for event in events
        ),
    },
}

summary_path = os.environ.get("MUSU_REAL_MCP_SMOKE_SUMMARY_PATH", "").strip()
if summary_path:
    summary_dir = os.path.dirname(summary_path)
    if summary_dir:
        os.makedirs(summary_dir, exist_ok=True)
    with open(summary_path, "w", encoding="utf-8") as handle:
        json.dump(summary, handle, ensure_ascii=True, indent=2)
        handle.write("\n")

print(json.dumps(summary, ensure_ascii=True, indent=2))
PY

SUCCESS=1
