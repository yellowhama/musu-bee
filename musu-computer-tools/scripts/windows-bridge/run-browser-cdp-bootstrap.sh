#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

usage() {
  cat <<'EOF'
Usage: run-browser-cdp-bootstrap.sh [options]

Options:
  --browser NAME           auto|edge|chrome (default: auto)
  --port N                 CDP port (default: 9222)
  --bind-host HOST         CDP bind host (default: 127.0.0.1)
  --user-data-dir PATH     Optional Windows or Linux path for dedicated browser profile
  --initial-url URL        Initial page (default: about:blank)
  --probe-timeout-sec N    Post-launch probe timeout (default: 5)
  --dry-run                Resolve path and arguments without launching the browser
  --force-direct           Force direct interop mode
  --force-helper           Force helper queue mode
  --timeout-sec N          Helper wait timeout in seconds
  --help                   Show this help
EOF
}

browser="auto"
port="9222"
bind_host="127.0.0.1"
user_data_dir=""
initial_url="about:blank"
probe_timeout_sec="5"
dry_run=0
runner_args=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --browser)
      browser="$2"
      shift 2
      ;;
    --port)
      port="$2"
      shift 2
      ;;
    --bind-host)
      bind_host="$2"
      shift 2
      ;;
    --user-data-dir)
      user_data_dir="$2"
      shift 2
      ;;
    --initial-url)
      initial_url="$2"
      shift 2
      ;;
    --probe-timeout-sec)
      probe_timeout_sec="$2"
      shift 2
      ;;
    --dry-run)
      dry_run=1
      shift
      ;;
    --force-direct|--force-helper)
      runner_args+=("$1")
      shift
      ;;
    --timeout-sec)
      runner_args+=("$1" "$2")
      shift 2
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

script_args=(-Browser "$browser" -Port "$port" -BindHost "$bind_host" -InitialUrl "$initial_url" -ProbeTimeoutSeconds "$probe_timeout_sec")

if [ -n "$user_data_dir" ]; then
  script_args+=(-UserDataDir "$(windows_bridge::path_to_windows "$user_data_dir")")
fi

if [ "$dry_run" -eq 1 ]; then
  script_args+=(-DryRun)
fi

exec "$SCRIPT_DIR/run-windows-action.sh" \
  --display-name "Windows browser CDP bootstrap" \
  --direct-script "$WINDOWS_BRIDGE_REPO_ROOT/scripts/windows-bridge/launch-browser-cdp.ps1" \
  --direct-kind powershell_file \
  --helper-script "$WINDOWS_BRIDGE_REPO_ROOT/scripts/windows-bridge/launch-browser-cdp.ps1" \
  --helper-kind powershell_file \
  --manual-script "$WINDOWS_BRIDGE_REPO_ROOT/scripts/windows-bridge/run-browser-cdp-bootstrap.cmd" \
  --working-dir "$WINDOWS_BRIDGE_REPO_ROOT/scripts/windows-bridge" \
  "${runner_args[@]}" \
  -- "${script_args[@]}"
