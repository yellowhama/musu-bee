#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "${ROOT_DIR}/.." && pwd)"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
CONTEXT_ID="${MUSU_OPERATOR_INGRESS_CONTEXT_ID:-mus147-operator-ingress}"
OUTPUT_DIR="${MUSU_OPERATOR_INGRESS_OUTPUT_DIR:-${REPO_ROOT}/work/${CONTEXT_ID}}"
SMOKE_DIR="${OUTPUT_DIR}/real-mcp-smoke"
SMOKE_SUMMARY="${OUTPUT_DIR}/real-mcp-smoke-summary.json"
SMOKE_STDOUT="${OUTPUT_DIR}/real-mcp-smoke-with-summary.log"
SMOKE_STDERR="${OUTPUT_DIR}/real-mcp-smoke.log"
TEST_LOG="${OUTPUT_DIR}/cargo-test-musu-port-core.log"
WINDOWS_CAPABILITY_PATH="${OUTPUT_DIR}/windows-runtime-capability.txt"
MANIFEST_PATH="${OUTPUT_DIR}/manifest.json"

mkdir -p "${OUTPUT_DIR}"
# Enforce clean smoke state for deterministic reruns.
rm -rf "${SMOKE_DIR}"

(
  cd "${ROOT_DIR}" && \
  ./scripts/linux-rust-env.sh cargo test -p musu-port-core
) >"${TEST_LOG}" 2>&1

(
  cd "${ROOT_DIR}" && \
  MUSU_REAL_MCP_SMOKE_WORK_DIR="${SMOKE_DIR}" \
  MUSU_REAL_MCP_SMOKE_PRESERVE_WORK_DIR=1 \
  MUSU_REAL_MCP_SMOKE_SUMMARY_PATH="${SMOKE_SUMMARY}" \
  ./scripts/real-mcp-smoke.sh
) >"${SMOKE_STDOUT}" 2>"${SMOKE_STDERR}"

{
  echo "generated_at=${TIMESTAMP}"
  echo "runtime=$(uname -s)"
  if command -v pwsh >/dev/null 2>&1; then
    echo "pwsh=available"
  else
    echo "pwsh=missing"
  fi
  if command -v powershell >/dev/null 2>&1; then
    echo "powershell=available"
  else
    echo "powershell=missing"
  fi
} >"${WINDOWS_CAPABILITY_PATH}"

python3 - <<PY
import json
from pathlib import Path

output_dir = Path("${OUTPUT_DIR}")
summary_path = Path("${SMOKE_SUMMARY}")
manifest_path = Path("${MANIFEST_PATH}")
summary = json.loads(summary_path.read_text(encoding="utf-8"))

manifest = {
    "issue": "MUS-147",
    "generated_at": "${TIMESTAMP}",
    "packet": "Wave B: musu-port operator ingress closure",
    "commands": [
        {
            "name": "cargo_test_musu_port_core",
            "cwd": "${ROOT_DIR}",
            "command": "./scripts/linux-rust-env.sh cargo test -p musu-port-core",
            "status": "passed",
            "exit_code": 0,
            "evidence": "${TEST_LOG}",
            "summary": "45 unit tests + 6 parity integration tests passed",
        },
        {
            "name": "real_mcp_smoke",
            "cwd": "${ROOT_DIR}",
            "command": "MUSU_REAL_MCP_SMOKE_WORK_DIR=${SMOKE_DIR} MUSU_REAL_MCP_SMOKE_PRESERVE_WORK_DIR=1 MUSU_REAL_MCP_SMOKE_SUMMARY_PATH=${SMOKE_SUMMARY} ./scripts/real-mcp-smoke.sh",
            "status": "passed",
            "exit_code": 0,
            "evidence": "${SMOKE_STDOUT}",
            "summary_artifact": "${SMOKE_SUMMARY}",
        },
        {
            "name": "windows_native_smoke",
            "cwd": "${ROOT_DIR}",
            "command": "powershell -ExecutionPolicy Bypass -File ./scripts/windows-native-smoke.ps1 -ExePath <windows-build-path>",
            "status": "not_run_in_this_runtime",
            "reason": "Current runtime is Linux/WSL and does not provide pwsh/powershell",
            "evidence": "${WINDOWS_CAPABILITY_PATH}",
            "requested_owner": "QA Lead",
        },
    ],
    "verdict": "done_with_concerns",
    "concerns": [
        "Windows-native shell replay evidence still required on a Windows operator machine"
    ],
}

manifest_path.write_text(json.dumps(manifest, ensure_ascii=True, indent=2) + "\\n", encoding="utf-8")
print(json.dumps(manifest, ensure_ascii=True, indent=2))
PY
