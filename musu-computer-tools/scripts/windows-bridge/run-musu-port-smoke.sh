#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

exec "$SCRIPT_DIR/run-windows-action.sh" \
  --display-name "musu-port Windows smoke" \
  --direct-script "$WINDOWS_BRIDGE_REPO_ROOT/scripts/windows-bridge/run-musu-port-smoke.ps1" \
  --direct-kind powershell_file \
  --helper-script "$WINDOWS_BRIDGE_REPO_ROOT/scripts/windows-bridge/run-musu-port-smoke-helper.cmd" \
  --helper-kind cmd_file \
  --manual-script "$WINDOWS_BRIDGE_REPO_ROOT/scripts/windows-bridge/run-musu-port-smoke.cmd" \
  --working-dir "$WINDOWS_BRIDGE_REPO_ROOT" \
  "$@"
