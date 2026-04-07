#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

usage() {
  cat <<'EOF'
Usage: run-helper-selftest.sh [runner options] [-- script args...]

Runner options:
  --force-direct            Force direct interop mode
  --force-helper            Force helper queue mode
  --timeout-sec N           Helper wait timeout in seconds
  --help                    Show this help

Script args:
  Forwarded to helper-selftest.ps1
  Example: -- -Label catalog-direct
EOF
}

runner_args=()
script_args=()

while [ "$#" -gt 0 ]; do
  case "$1" in
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
    --)
      shift
      script_args=("$@")
      break
      ;;
    *)
      script_args+=("$1")
      shift
      ;;
  esac
done

exec "$SCRIPT_DIR/run-windows-action.sh" \
  --display-name "windows-bridge helper selftest" \
  --direct-script "$SCRIPT_DIR/helper-selftest.ps1" \
  --helper-script "$SCRIPT_DIR/helper-selftest.ps1" \
  --manual-script "$SCRIPT_DIR/run-helper-selftest.cmd" \
  --working-dir "$SCRIPT_DIR" \
  "${runner_args[@]}" \
  -- "${script_args[@]}"
