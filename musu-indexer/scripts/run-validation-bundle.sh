#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
OUTDIR="$ROOT/work/validation"
ONLINE_EXTRAS=0

usage() {
  cat <<'EOF'
usage: run-validation-bundle.sh [--online-extras]

Runs host prerequisite checks, smoke, and packaged-install smoke, then writes
an aggregate report into work/validation/.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
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

mkdir -p "$OUTDIR"

HOST_REPORT="$OUTDIR/packaged-host-prereqs-$STAMP.txt"
PACKAGED_REPORT="$OUTDIR/packaged-install-smoke-$STAMP.txt"
BUNDLE_REPORT="$OUTDIR/validation-bundle-$STAMP.txt"
SMOKE_LOG="$OUTDIR/smoke-$STAMP.log"
PACKAGED_WORKDIR="$OUTDIR/packaged-install-work-$STAMP"

HOST_STATUS="failed"
SMOKE_STATUS="failed"
PACKAGED_STATUS="failed"
BUNDLE_STATUS="failed"

echo "[1/3] host packaged prereqs"
if bash "$ROOT/scripts/check-packaged-host-prereqs.sh" "$HOST_REPORT" >/dev/null; then
  HOST_STATUS="ready"
else
  HOST_STATUS="blocked"
fi

echo "[2/3] local smoke"
if bash "$ROOT/scripts/run-smoke.sh" >"$SMOKE_LOG" 2>&1; then
  SMOKE_STATUS="success"
else
  SMOKE_STATUS="failed"
fi

echo "[3/3] packaged install smoke"
PACKAGED_CMD=(bash "$ROOT/scripts/run-packaged-install-smoke.sh" --workdir "$PACKAGED_WORKDIR" --report "$PACKAGED_REPORT")
if [[ "$ONLINE_EXTRAS" -eq 1 ]]; then
  PACKAGED_CMD+=(--online-extras)
fi
if "${PACKAGED_CMD[@]}" >/dev/null; then
  PACKAGED_STATUS="success"
else
  exit_code=$?
  if [[ "$exit_code" -eq 2 ]]; then
    PACKAGED_STATUS="blocked"
  else
    PACKAGED_STATUS="failed"
  fi
fi

if [[ "$SMOKE_STATUS" == "failed" || "$PACKAGED_STATUS" == "failed" ]]; then
  BUNDLE_STATUS="failed"
elif [[ "$HOST_STATUS" == "blocked" || "$PACKAGED_STATUS" == "blocked" ]]; then
  BUNDLE_STATUS="blocked"
else
  BUNDLE_STATUS="success"
fi

{
  echo "timestamp_utc: $STAMP"
  echo "bundle_status: $BUNDLE_STATUS"
  echo "host_prereqs_status: $HOST_STATUS"
  echo "smoke_status: $SMOKE_STATUS"
  echo "packaged_status: $PACKAGED_STATUS"
  echo "smoke_log: $SMOKE_LOG"
  echo "host_report: $HOST_REPORT"
  echo "packaged_report: $PACKAGED_REPORT"
  echo "packaged_workdir: $PACKAGED_WORKDIR"
  echo "online_extras: $ONLINE_EXTRAS"
} >"$BUNDLE_REPORT"

echo "bundle_report: $BUNDLE_REPORT"
echo "smoke_log: $SMOKE_LOG"
echo "host_report: $HOST_REPORT"
echo "packaged_report: $PACKAGED_REPORT"

if [[ "$BUNDLE_STATUS" == "success" ]]; then
  exit 0
fi

if [[ "$BUNDLE_STATUS" == "blocked" ]]; then
  exit 2
fi

exit 1
