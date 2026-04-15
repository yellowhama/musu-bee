#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-$ROOT_DIR/work/mvp1-demo-fixture-smoke}"
TRANSCRIPT_PATH="$OUT_DIR/mvp1-demo-transcript.txt"
SUMMARY_PATH="$OUT_DIR/mvp1-demo-summary.json"

mkdir -p "$OUT_DIR"

set +e
"$ROOT_DIR/scripts/mvp1_demo.sh" --mode fixture "$OUT_DIR" | tee "$TRANSCRIPT_PATH"
DEMO_RC="${PIPESTATUS[0]}"
set -e

if [[ "$DEMO_RC" -ne 0 ]]; then
  echo "[FAIL] mvp1_demo.sh fixture run failed (exit=$DEMO_RC)" >&2
  exit "$DEMO_RC"
fi

if [[ ! -f "$SUMMARY_PATH" ]]; then
  echo "[FAIL] summary json not found: $SUMMARY_PATH" >&2
  exit 1
fi

jq -e '
  has("forward_decision")
  and has("round_trip_ms")
  and has("result")
  and (.forward_decision | type == "string" and length > 0)
  and (.round_trip_ms | type == "number" and . >= 1)
  and (.result | type == "string" and length > 0)
' "$SUMMARY_PATH" >/dev/null

echo "[PASS] mvp1 fixture smoke contract"
echo "summary=$SUMMARY_PATH"
echo "transcript=$TRANSCRIPT_PATH"
