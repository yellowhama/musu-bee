#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/mcp_banner.sh"

if ! command -v codex >/dev/null 2>&1; then
  echo "[ERROR] codex CLI not found in PATH"
  print_mcp_failure_hint
  exit 1
fi

STABLE_BIN="/home/hugh51/tools/Pencil-1.1.24-linux-x64/resources/app.asar.unpacked/out/mcp-server-linux-x64"

resolve_mount_bin() {
  ls -1dt /tmp/.mount_Pencil*/resources/app.asar.unpacked/out/mcp-server-linux-x64 2>/dev/null | head -n 1 || true
}

if [[ -x "$STABLE_BIN" ]]; then
  TARGET_BIN="$STABLE_BIN"
else
  TARGET_BIN="$(resolve_mount_bin)"
fi

if [[ -z "${TARGET_BIN:-}" || ! -x "$TARGET_BIN" ]]; then
  echo "[ERROR] Pencil MCP server binary not found."
  echo "Checked:"
  echo "  - $STABLE_BIN"
  echo "  - /tmp/.mount_Pencil*/resources/app.asar.unpacked/out/mcp-server-linux-x64"
  print_mcp_failure_hint
  exit 2
fi

EXPECTED_ARGS="--app desktop"
CURRENT_INFO="$(codex mcp get pencil 2>/dev/null || true)"
CURRENT_CMD="$(printf '%s\n' "$CURRENT_INFO" | awk -F': ' '/^  command:/{print $2}')"
CURRENT_ARGS="$(printf '%s\n' "$CURRENT_INFO" | awk -F': ' '/^  args:/{print $2}')"

if [[ "$CURRENT_CMD" == "$TARGET_BIN" && "$CURRENT_ARGS" == "$EXPECTED_ARGS" ]]; then
  echo "[OK] pencil MCP already points to stable binary with expected args"
  codex mcp get pencil
  print_mcp_banner
  exit 0
fi

if [[ "$CURRENT_CMD" == "$TARGET_BIN" && "$CURRENT_ARGS" != "$EXPECTED_ARGS" ]]; then
  echo "[INFO] pencil MCP args drift detected: '$CURRENT_ARGS' (expected '$EXPECTED_ARGS')"
fi

if codex mcp get pencil >/dev/null 2>&1; then
  codex mcp remove pencil >/dev/null
fi

codex mcp add pencil -- "$TARGET_BIN" --app desktop >/dev/null

echo "[OK] pencil MCP server synced"
codex mcp get pencil
print_mcp_banner
