#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/mus55-operator-oneflow-harness.sh [out_dir]
  ./scripts/mus55-operator-oneflow-harness.sh --context-id <id> [out_dir]
  ./scripts/mus55-operator-oneflow-harness.sh --success-scenario <verified-peer|unverified-peer> --failure-scenario <blocked-peer|unverified-peer> [out_dir]

Examples:
  ./scripts/mus55-operator-oneflow-harness.sh
  ./scripts/mus55-operator-oneflow-harness.sh --context-id mus55-demo-ctx-001
  ./scripts/mus55-operator-oneflow-harness.sh --success-scenario verified-peer --failure-scenario blocked-peer /tmp/mus55-operator-oneflow
USAGE
}

CONTEXT_ID="${MUSU_OPERATOR_CONTEXT_ID:-ctx-$(date -u +"%Y%m%dT%H%M%SZ")}"
SUCCESS_SCENARIO="${MUSU_OPERATOR_SUCCESS_SCENARIO:-verified-peer}"
FAILURE_SCENARIO="${MUSU_OPERATOR_FAILURE_SCENARIO:-blocked-peer}"
OUT_DIR="${ROOT_DIR}/work/mus55-operator-oneflow"
OUT_DIR_EXPLICIT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --context-id)
      [[ $# -ge 2 ]] || { echo "[FAIL] --context-id requires a value" >&2; exit 2; }
      CONTEXT_ID="$2"
      shift 2
      ;;
    --success-scenario)
      [[ $# -ge 2 ]] || { echo "[FAIL] --success-scenario requires a value" >&2; exit 2; }
      SUCCESS_SCENARIO="$2"
      shift 2
      ;;
    --failure-scenario)
      [[ $# -ge 2 ]] || { echo "[FAIL] --failure-scenario requires a value" >&2; exit 2; }
      FAILURE_SCENARIO="$2"
      shift 2
      ;;
    -h|--help|help)
      usage
      exit 0
      ;;
    *)
      if [[ "$OUT_DIR_EXPLICIT" == false ]]; then
        OUT_DIR="$1"
        OUT_DIR_EXPLICIT=true
        shift
      else
        echo "[FAIL] unexpected argument: $1" >&2
        usage >&2
        exit 2
      fi
      ;;
  esac
done

case "$SUCCESS_SCENARIO" in
  verified-peer|unverified-peer) ;;
  *)
    echo "[FAIL] invalid --success-scenario '$SUCCESS_SCENARIO' (expected verified-peer|unverified-peer)" >&2
    exit 2
    ;;
esac

case "$FAILURE_SCENARIO" in
  blocked-peer|unverified-peer) ;;
  *)
    echo "[FAIL] invalid --failure-scenario '$FAILURE_SCENARIO' (expected blocked-peer|unverified-peer)" >&2
    exit 2
    ;;
esac

NOW="${MUSU_OPERATOR_NOW:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"

SUCCESS_DIR="$OUT_DIR/success"
FAILURE_DIR="$OUT_DIR/failure"
SUCCESS_LANE2_DIR="$SUCCESS_DIR/lane2"
FAILURE_LANE2_DIR="$FAILURE_DIR/lane2"
SUCCESS_SUMMARY="$SUCCESS_DIR/summary.json"
SUCCESS_OPERATOR_VIEW="$SUCCESS_DIR/operator-view.json"
FAILURE_SUMMARY="$FAILURE_DIR/summary.json"
FAILURE_OPERATOR_VIEW="$FAILURE_DIR/operator-view.json"
SUCCESS_CONTEXT_JSON="$OUT_DIR/operator-context-success.json"
FAILURE_CONTEXT_JSON="$OUT_DIR/operator-context-failure.json"
MANIFEST_JSON="$OUT_DIR/mus55-operator-oneflow-manifest.json"

mkdir -p "$OUT_DIR"

# Success replay: route identity + CRT summary must be visible under one context.
"$ROOT_DIR/scripts/mus27-live-session-harness.sh" \
  --scenario "$SUCCESS_SCENARIO" \
  "$SUCCESS_LANE2_DIR"

node "$ROOT_DIR/MUSU-CRT/tools/mus28_crt_remote_read_proof.mjs" \
  --lane2-proof "$SUCCESS_LANE2_DIR/musu-connects-live-proof.json" \
  --summary-json "$SUCCESS_SUMMARY" \
  --operator-view-json "$SUCCESS_OPERATOR_VIEW"

node "$ROOT_DIR/MUSU-CRT/tools/mus55_operator_context_compose.mjs" \
  --context-id "$CONTEXT_ID" \
  --mode success \
  --lane2-proof "$SUCCESS_LANE2_DIR/musu-connects-live-proof.json" \
  --lane3-summary "$SUCCESS_SUMMARY" \
  --lane3-operator-view "$SUCCESS_OPERATOR_VIEW" \
  --out-json "$SUCCESS_CONTEXT_JSON"

# Failure replay: operator-visible blocker with the same context id.
"$ROOT_DIR/scripts/mus27-live-session-harness.sh" \
  --scenario "$FAILURE_SCENARIO" \
  "$FAILURE_LANE2_DIR"

node "$ROOT_DIR/MUSU-CRT/tools/mus28_crt_remote_read_proof.mjs" \
  --lane2-proof "$FAILURE_LANE2_DIR/musu-connects-live-proof.json" \
  --summary-json "$FAILURE_SUMMARY" \
  --operator-view-json "$FAILURE_OPERATOR_VIEW"

node "$ROOT_DIR/MUSU-CRT/tools/mus55_operator_context_compose.mjs" \
  --context-id "$CONTEXT_ID" \
  --mode failure \
  --lane2-proof "$FAILURE_LANE2_DIR/musu-connects-live-proof.json" \
  --lane3-summary "$FAILURE_SUMMARY" \
  --lane3-operator-view "$FAILURE_OPERATOR_VIEW" \
  --out-json "$FAILURE_CONTEXT_JSON"

cat >"$MANIFEST_JSON" <<JSON
{
  "harness": "mus55-operator-oneflow-harness",
  "generated_at": "$NOW",
  "context_id": "$CONTEXT_ID",
  "success_scenario": "$SUCCESS_SCENARIO",
  "failure_scenario": "$FAILURE_SCENARIO",
  "artifacts": {
    "success_lane2_proof": "$SUCCESS_LANE2_DIR/musu-connects-live-proof.json",
    "success_summary": "$SUCCESS_SUMMARY",
    "success_operator_view": "$SUCCESS_OPERATOR_VIEW",
    "success_context": "$SUCCESS_CONTEXT_JSON",
    "failure_lane2_proof": "$FAILURE_LANE2_DIR/musu-connects-live-proof.json",
    "failure_summary": "$FAILURE_SUMMARY",
    "failure_operator_view": "$FAILURE_OPERATOR_VIEW",
    "failure_context": "$FAILURE_CONTEXT_JSON"
  }
}
JSON

echo "[OK] MUS-55 operator one-flow harness artifacts generated"
echo "  - context id:       $CONTEXT_ID"
echo "  - success context:  $SUCCESS_CONTEXT_JSON"
echo "  - failure context:  $FAILURE_CONTEXT_JSON"
echo "  - manifest:         $MANIFEST_JSON"
