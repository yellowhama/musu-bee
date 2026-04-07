#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

usage() {
  cat <<'EOF'
Usage: run-musu-port-native-smoke.sh --exe-path PATH [options]

Options:
  --exe-path PATH           Windows or Linux path to musu-portd.exe
  --device-id ID            Device ID for the smoke run
  --data-root PATH          Optional Windows or Linux data root
  --discovery-provider NAME Discovery provider (default: windows)
  --port N                  Fixed manager port
  --backend-port N          Fixed backend port
  --probe-port N            Fixed probe port
  --force-direct            Force direct interop mode
  --force-helper            Force helper queue mode
  --timeout-sec N           Helper wait timeout in seconds
  --help                    Show this help
EOF
}

exe_path=""
device_id=""
data_root=""
discovery_provider=""
port=""
backend_port=""
probe_port=""
runner_args=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --exe-path)
      exe_path="$2"
      shift 2
      ;;
    --device-id)
      device_id="$2"
      shift 2
      ;;
    --data-root)
      data_root="$2"
      shift 2
      ;;
    --discovery-provider)
      discovery_provider="$2"
      shift 2
      ;;
    --port)
      port="$2"
      shift 2
      ;;
    --backend-port)
      backend_port="$2"
      shift 2
      ;;
    --probe-port)
      probe_port="$2"
      shift 2
      ;;
    --force-direct|--force-helper|--timeout-sec)
      runner_args+=("$1")
      if [ "$1" = "--timeout-sec" ]; then
        runner_args+=("$2")
        shift 2
      else
        shift
      fi
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

if [ -z "$exe_path" ]; then
  usage >&2
  exit 2
fi

exe_path_windows="$(windows_bridge::path_to_windows "$exe_path")"
script_args=(-ExePath "$exe_path_windows")

if [ -n "$device_id" ]; then
  script_args+=(-DeviceId "$device_id")
fi
if [ -n "$data_root" ]; then
  data_root_windows="$(windows_bridge::path_to_windows "$data_root")"
  script_args+=(-DataRoot "$data_root_windows")
fi
if [ -n "$discovery_provider" ]; then
  script_args+=(-DiscoveryProvider "$discovery_provider")
fi
if [ -n "$port" ]; then
  script_args+=(-Port "$port")
fi
if [ -n "$backend_port" ]; then
  script_args+=(-BackendPort "$backend_port")
fi
if [ -n "$probe_port" ]; then
  script_args+=(-ProbePort "$probe_port")
fi

exec "$SCRIPT_DIR/run-windows-action.sh" \
  --display-name "musu-port Windows native smoke" \
  --direct-script "$WINDOWS_BRIDGE_REPO_ROOT/scripts/windows-bridge/run-musu-port-native-smoke.ps1" \
  --direct-kind powershell_file \
  --helper-script "$WINDOWS_BRIDGE_REPO_ROOT/scripts/windows-bridge/run-musu-port-native-smoke.ps1" \
  --helper-kind powershell_file \
  --manual-script "$WINDOWS_BRIDGE_REPO_ROOT/scripts/windows-bridge/run-musu-port-native-smoke.cmd" \
  --working-dir "$WINDOWS_BRIDGE_REPO_ROOT" \
  "${runner_args[@]}" \
  -- "${script_args[@]}"
