#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
WORKDIR="/tmp/musu-indexer-packaged-smoke-$DEFAULT_STAMP-$$"
REPORT_PATH=""
ONLINE_EXTRAS=0
VENV_BACKEND="none"

usage() {
  cat <<'EOF'
usage: run-packaged-install-smoke.sh [--workdir <path>] [--report <path>] [--online-extras]

  --workdir <path>     Temporary working directory for the isolated install
  --report <path>      Write a smoke report to this path
  --online-extras      Attempt real extras installs for .[mcp], .[watch], .[full]
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workdir)
      WORKDIR="${2:?missing value for --workdir}"
      shift 2
      ;;
    --report)
      REPORT_PATH="${2:?missing value for --report}"
      shift 2
      ;;
    --online-extras)
      ONLINE_EXTRAS=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 64
      ;;
  esac
done

VENV_DIR="$WORKDIR/venv"
REPORT_PATH="${REPORT_PATH:-$WORKDIR/packaged-install-smoke-report.txt}"
STATUS="success"
SUMMARY="packaged install smoke complete"
CHECKS=()

mkdir -p "$WORKDIR"
mkdir -p "$(dirname "$REPORT_PATH")"

record_check() {
  CHECKS+=("$1|$2|$3")
}

create_venv() {
  if python3 -m venv "$VENV_DIR" >/dev/null 2>&1; then
    VENV_BACKEND="python3-venv"
    return 0
  fi

  record_check "python3_venv" "blocked" "python3 -m venv failed"

  if command -v uv >/dev/null 2>&1; then
    if uv venv --seed "$VENV_DIR" >/dev/null 2>&1; then
      VENV_BACKEND="uv"
      return 0
    fi
    record_check "uv_venv" "blocked" "uv venv --seed failed"
    return 1
  fi

  record_check "uv_venv" "blocked" "uv not installed"
  return 1
}

write_report() {
  {
    echo "status: $STATUS"
    echo "summary: $SUMMARY"
    echo "timestamp_utc: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo "root: $ROOT"
    echo "workdir: $WORKDIR"
    echo "venv_dir: $VENV_DIR"
    echo "venv_backend: $VENV_BACKEND"
    echo "python3: $(command -v python3 || echo unavailable)"
    echo "uv: $(command -v uv || echo unavailable)"
    echo "online_extras: $ONLINE_EXTRAS"
    echo "checks:"
    for entry in "${CHECKS[@]}"; do
      IFS='|' read -r name state detail <<<"$entry"
      printf '  - %s: %s' "$name" "$state"
      if [[ -n "$detail" ]]; then
        printf ' (%s)' "$detail"
      fi
      printf '\n'
    done
  } >"$REPORT_PATH"
}

block() {
  STATUS="blocked"
  SUMMARY="$1"
  record_check "$2" "blocked" "$1"
  write_report
  echo "$1"
  echo "report: $REPORT_PATH"
  exit 2
}

fail() {
  STATUS="failed"
  SUMMARY="$1"
  record_check "$2" "failed" "$1"
  write_report
  echo "$1" >&2
  echo "report: $REPORT_PATH" >&2
  exit 1
}

echo "[1/5] preflight"
if ! create_venv; then
  block "packaged install smoke blocked: python3-venv/ensurepip is unavailable and no usable uv fallback was found" "preflight"
fi
record_check "preflight" "ok" "venv created via $VENV_BACKEND"

if ! "$VENV_DIR/bin/python" -m pip --version >/dev/null 2>&1; then
  block "packaged install smoke blocked: pip is unavailable inside the virtual environment" "preflight"
fi
record_check "pip" "ok" "pip available"

echo "[2/5] base install"
if ! "$VENV_DIR/bin/python" -m pip install "$ROOT" >/dev/null; then
  block "packaged install smoke blocked: local build/install failed (likely missing build backend such as hatchling)" "base_install"
fi
record_check "base_install" "ok" "pip install root"

echo "[3/5] entrypoint help"
"$VENV_DIR/bin/musu-indexer" --help >/dev/null
"$VENV_DIR/bin/musu-indexer" sync --help >/dev/null
record_check "entrypoint_help" "ok" "cli help"

echo "[4/5] base install missing-runtime messages"
MCP_OUTPUT="$("$VENV_DIR/bin/musu-indexer" mcp 2>&1 || true)"
if ! printf '%s' "$MCP_OUTPUT" | grep -q "MCP runtime is not installed"; then
  fail "packaged install smoke failed: base install did not emit the expected MCP missing-runtime message" "mcp_missing_runtime"
fi
record_check "mcp_missing_runtime" "ok" "base install message"

WATCH_OUTPUT="$("$VENV_DIR/bin/musu-indexer" watch --root "$ROOT" 2>&1 || true)"
if ! printf '%s' "$WATCH_OUTPUT" | grep -q "Watcher runtime is not installed"; then
  fail "packaged install smoke failed: base install did not emit the expected watcher missing-runtime message" "watch_missing_runtime"
fi
record_check "watch_missing_runtime" "ok" "base install message"

echo "[5/5] extras metadata install syntax"
if "$VENV_DIR/bin/python" -m pip install --no-deps "$ROOT[mcp]" >/dev/null 2>&1; then
  echo "extras metadata: mcp ok"
  record_check "extras_metadata_mcp" "ok" "pip install --no-deps"
else
  echo "extras metadata: mcp blocked"
  record_check "extras_metadata_mcp" "blocked" "pip install --no-deps"
fi

if "$VENV_DIR/bin/python" -m pip install --no-deps "$ROOT[watch]" >/dev/null 2>&1; then
  echo "extras metadata: watch ok"
  record_check "extras_metadata_watch" "ok" "pip install --no-deps"
else
  echo "extras metadata: watch blocked"
  record_check "extras_metadata_watch" "blocked" "pip install --no-deps"
fi

if [[ "$ONLINE_EXTRAS" -eq 1 ]]; then
  echo "[6/6] online extras install"
  if "$VENV_DIR/bin/python" -m pip install "$ROOT[mcp]" >/dev/null 2>&1; then
    if "$VENV_DIR/bin/python" -c "import mcp" >/dev/null 2>&1; then
      record_check "extras_online_mcp" "ok" "pip install .[mcp] + import mcp"
    else
      fail "packaged install smoke failed: .[mcp] installed but import mcp failed" "extras_online_mcp"
    fi
  else
    record_check "extras_online_mcp" "blocked" "pip install .[mcp]"
  fi

  if "$VENV_DIR/bin/python" -m pip install "$ROOT[watch]" >/dev/null 2>&1; then
    if "$VENV_DIR/bin/python" -c "import watchdog" >/dev/null 2>&1; then
      record_check "extras_online_watch" "ok" "pip install .[watch] + import watchdog"
    else
      fail "packaged install smoke failed: .[watch] installed but import watchdog failed" "extras_online_watch"
    fi
  else
    record_check "extras_online_watch" "blocked" "pip install .[watch]"
  fi

  if "$VENV_DIR/bin/python" -m pip install "$ROOT[full]" >/dev/null 2>&1; then
    if "$VENV_DIR/bin/python" -c "import mcp, watchdog" >/dev/null 2>&1; then
      record_check "extras_online_full" "ok" "pip install .[full] + import mcp/watchdog"
    else
      fail "packaged install smoke failed: .[full] installed but runtime imports failed" "extras_online_full"
    fi
  else
    record_check "extras_online_full" "blocked" "pip install .[full]"
  fi
fi

write_report
echo "report: $REPORT_PATH"
echo "packaged install smoke complete"
