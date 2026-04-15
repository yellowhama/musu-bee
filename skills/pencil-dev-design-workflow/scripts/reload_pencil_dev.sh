#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 /absolute/path/to/file.pen [main_log_file]"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/mcp_banner.sh"
PEN_FILE="$1"
MAIN_LOG_FILE="${2:-${PENCIL_MAIN_LOG:-/home/hugh51/.config/Pencil/logs/main.log}}"
RELOAD_WAIT_SECS="${PENCIL_RELOAD_WAIT_SECS:-1}"
POST_START_CHECK_DELAY_SECS="${PENCIL_POST_START_CHECK_DELAY_SECS:-4}"

if ! [[ "$RELOAD_WAIT_SECS" =~ ^[0-9]+$ ]]; then
  RELOAD_WAIT_SECS=1
fi
if ! [[ "$POST_START_CHECK_DELAY_SECS" =~ ^[0-9]+$ ]]; then
  POST_START_CHECK_DELAY_SECS=4
fi

echo "[INFO] Reloading Pencil for: $PEN_FILE"
print_mcp_banner
"$SCRIPT_DIR/stop_pencil_dev.sh" || true
sleep "$RELOAD_WAIT_SECS"
"$SCRIPT_DIR/start_pencil_dev.sh" "$PEN_FILE"
sleep "$POST_START_CHECK_DELAY_SECS"
"$SCRIPT_DIR/check_pencil_connection.sh" "$PEN_FILE" "$MAIN_LOG_FILE"
