#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_PATH="${1:-$ROOT/work/validation/packaged-host-prereqs.txt}"
STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
TMPDIR_BASE="/tmp/musu-indexer-host-prereqs-$STAMP-$$"
PY_VENV_DIR="$TMPDIR_BASE/python3-venv"
UV_VENV_DIR="$TMPDIR_BASE/uv-venv"

cleanup() {
  rm -rf "$TMPDIR_BASE"
}
trap cleanup EXIT

mkdir -p "$(dirname "$REPORT_PATH")"
rm -rf "$TMPDIR_BASE"
mkdir -p "$TMPDIR_BASE"

PYTHON3_PATH="$(command -v python3 || echo unavailable)"
PYTHON3_VERSION="$($PYTHON3_PATH --version 2>/dev/null || echo unavailable)"
UV_PATH="$(command -v uv || echo unavailable)"
UV_VERSION="unavailable"
if [[ "$UV_PATH" != "unavailable" ]]; then
  UV_VERSION="$("$UV_PATH" --version 2>/dev/null || echo unavailable)"
fi

PYTHON3_VENV_STATUS="blocked"
PYTHON3_VENV_DETAIL="python3 -m venv failed"
if [[ "$PYTHON3_PATH" != "unavailable" ]] && python3 -m venv "$PY_VENV_DIR" >/dev/null 2>&1; then
  if "$PY_VENV_DIR/bin/python" -m pip --version >/dev/null 2>&1; then
    PYTHON3_VENV_STATUS="ok"
    PYTHON3_VENV_DETAIL="python3 -m venv succeeded with pip"
  else
    PYTHON3_VENV_DETAIL="python3 -m venv succeeded but pip is unavailable"
  fi
fi

UV_VENV_STATUS="blocked"
UV_VENV_DETAIL="uv unavailable"
if [[ "$UV_PATH" != "unavailable" ]]; then
  if uv venv --seed "$UV_VENV_DIR" >/dev/null 2>&1; then
    if "$UV_VENV_DIR/bin/python" -m pip --version >/dev/null 2>&1; then
      UV_VENV_STATUS="ok"
      UV_VENV_DETAIL="uv venv --seed succeeded with pip"
    else
      UV_VENV_DETAIL="uv venv --seed succeeded but pip is unavailable"
    fi
  else
    UV_VENV_DETAIL="uv venv --seed failed"
  fi
fi

HOST_STATUS="blocked"
HOST_SUMMARY="No supported packaged-install bootstrap backend is ready"
if [[ "$PYTHON3_VENV_STATUS" == "ok" ]]; then
  HOST_STATUS="ready"
  HOST_SUMMARY="python3 -m venv is available"
elif [[ "$UV_VENV_STATUS" == "ok" ]]; then
  HOST_STATUS="ready"
  HOST_SUMMARY="uv bootstrap fallback is available"
fi

{
  echo "status: $HOST_STATUS"
  echo "summary: $HOST_SUMMARY"
  echo "timestamp_utc: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "root: $ROOT"
  echo "python3: $PYTHON3_PATH"
  echo "python3_version: $PYTHON3_VERSION"
  echo "uv: $UV_PATH"
  echo "uv_version: $UV_VERSION"
  echo "checks:"
  echo "  - python3_venv: $PYTHON3_VENV_STATUS ($PYTHON3_VENV_DETAIL)"
  echo "  - uv_venv: $UV_VENV_STATUS ($UV_VENV_DETAIL)"
} >"$REPORT_PATH"

echo "status: $HOST_STATUS"
echo "summary: $HOST_SUMMARY"
echo "report: $REPORT_PATH"

if [[ "$HOST_STATUS" == "ready" ]]; then
  exit 0
fi

exit 2
