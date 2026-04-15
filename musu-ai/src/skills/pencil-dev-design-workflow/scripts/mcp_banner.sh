#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLAYBOOK_PATH="${PLAYBOOK_PATH:-$SCRIPT_DIR/../references/pencil-mcp-tool-calling-playbook.md}"
MCP_SEQUENCE="${MCP_SEQUENCE:-batch_get -> get_screenshot(before) -> batch_design -> snapshot_layout -> get_screenshot(after)}"

print_mcp_banner() {
  echo "[MCP] Pencil workflow ready."
  echo "[MCP] Use sequence: $MCP_SEQUENCE"
  echo "[MCP] Playbook: $PLAYBOOK_PATH"
}

print_mcp_failure_hint() {
  echo "[MCP] Connection or startup is incomplete."
  echo "[MCP] Verify active .pen and retry the standard MCP sequence."
  echo "[MCP] Playbook: $PLAYBOOK_PATH"
}
