#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/mus71-dual-gpu-chain-harness.sh [out_dir]
  ./scripts/mus71-dual-gpu-chain-harness.sh --chain-id <id> [out_dir]
  ./scripts/mus71-dual-gpu-chain-harness.sh --success-scenario <verified-peer|unverified-peer> --failure-scenario <blocked-peer|unverified-peer> --retry-scenario <verified-peer|unverified-peer> [out_dir]

Examples:
  ./scripts/mus71-dual-gpu-chain-harness.sh
  ./scripts/mus71-dual-gpu-chain-harness.sh --chain-id mus56-dual-gpu-20260403T074500Z
  ./scripts/mus71-dual-gpu-chain-harness.sh --success-scenario verified-peer --failure-scenario blocked-peer --retry-scenario verified-peer /tmp/mus71-dual-gpu
USAGE
}

CHAIN_ID="${MUSU_CHAIN_CONTEXT_ID:-mus56-dual-gpu-$(date -u +"%Y%m%dT%H%M%SZ")}"
SUCCESS_SCENARIO="${MUSU_DUAL_GPU_SUCCESS_SCENARIO:-verified-peer}"
FAILURE_SCENARIO="${MUSU_DUAL_GPU_FAILURE_SCENARIO:-blocked-peer}"
RETRY_SCENARIO="${MUSU_DUAL_GPU_RETRY_SCENARIO:-verified-peer}"
OUT_DIR="${ROOT_DIR}/work/mus71-dual-gpu-chain"
OUT_DIR_EXPLICIT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --chain-id)
      [[ $# -ge 2 ]] || { echo "[FAIL] --chain-id requires a value" >&2; exit 2; }
      CHAIN_ID="$2"
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
    --retry-scenario)
      [[ $# -ge 2 ]] || { echo "[FAIL] --retry-scenario requires a value" >&2; exit 2; }
      RETRY_SCENARIO="$2"
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

case "$RETRY_SCENARIO" in
  verified-peer|unverified-peer) ;;
  *)
    echo "[FAIL] invalid --retry-scenario '$RETRY_SCENARIO' (expected verified-peer|unverified-peer)" >&2
    exit 2
    ;;
esac

NOW="${MUSU_DUAL_GPU_NOW:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"

CANON_DIR="$OUT_DIR/canonical-success"
FAIL_DIR="$OUT_DIR/failure"
RETRY_DIR="$OUT_DIR/retry"

CANON_LANE2_DIR="$CANON_DIR/lane2"
FAIL_LANE2_DIR="$FAIL_DIR/lane2"
RETRY_LANE2_DIR="$RETRY_DIR/lane2"

CANON_SUMMARY="$CANON_DIR/lane3/summary.json"
CANON_OPERATOR_VIEW="$CANON_DIR/lane3/operator-view.json"
FAIL_SUMMARY="$FAIL_DIR/lane3/summary.json"
FAIL_OPERATOR_VIEW="$FAIL_DIR/lane3/operator-view.json"
RETRY_SUMMARY="$RETRY_DIR/lane3/summary.json"
RETRY_OPERATOR_VIEW="$RETRY_DIR/lane3/operator-view.json"

CANON_STAGES_DIR="$CANON_DIR/stages"
FAIL_STAGES_DIR="$FAIL_DIR/stages"
RETRY_STAGES_DIR="$RETRY_DIR/stages"

CANON_GENERATION="$CANON_STAGES_DIR/generation.artifact.json"
CANON_QA="$CANON_STAGES_DIR/qa-tagging.artifact.json"
CANON_OPERATOR="$CANON_STAGES_DIR/operator-review.artifact.json"
FAIL_GENERATION="$FAIL_STAGES_DIR/generation.artifact.json"
FAIL_QA="$FAIL_STAGES_DIR/qa-tagging.artifact.json"
FAIL_OPERATOR="$FAIL_STAGES_DIR/operator-review.artifact.json"
RETRY_GENERATION="$RETRY_STAGES_DIR/generation.artifact.json"
RETRY_QA="$RETRY_STAGES_DIR/qa-tagging.artifact.json"
RETRY_OPERATOR="$RETRY_STAGES_DIR/operator-review.artifact.json"

ASSERTIONS_JSON="$OUT_DIR/assertions.json"
MANIFEST_JSON="$OUT_DIR/mus71-dual-gpu-chain-manifest.json"
REPLAY_TABLE_MD="$OUT_DIR/replay-table.md"
INVOCATION_JSON="$OUT_DIR/invocation.json"

run_phase() {
  local phase="$1"
  local attempt="$2"
  local scenario="$3"
  local lane2_dir="$4"
  local summary_json="$5"
  local operator_view_json="$6"
  local stages_dir="$7"

  mkdir -p "$lane2_dir" "$(dirname "$summary_json")" "$stages_dir"

  "$ROOT_DIR/scripts/mus27-live-session-harness.sh" --scenario "$scenario" "$lane2_dir"

  node "$ROOT_DIR/MUSU-CRT/tools/mus28_crt_remote_read_proof.mjs" \
    --lane2-proof "$lane2_dir/musu-connects-live-proof.json" \
    --summary-json "$summary_json" \
    --operator-view-json "$operator_view_json"

  node "$ROOT_DIR/MUSU-CRT/tools/mus71_dual_gpu_chain_compose.mjs" \
    --chain-id "$CHAIN_ID" \
    --phase "$phase" \
    --attempt "$attempt" \
    --lane2-proof "$lane2_dir/musu-connects-live-proof.json" \
    --lane3-summary "$summary_json" \
    --lane3-operator-view "$operator_view_json" \
    --out-dir "$stages_dir"
}

# Reset output directory so replay checks cannot read stale artifacts from prior runs.
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

cat >"$INVOCATION_JSON" <<JSON
{
  "artifactKind": "mus71-dual-gpu-chain-invocation-v1",
  "requestedAt": "$NOW",
  "requestedChainId": "$CHAIN_ID",
  "scenarios": {
    "canonical_success": "$SUCCESS_SCENARIO",
    "failure": "$FAILURE_SCENARIO",
    "retry": "$RETRY_SCENARIO"
  },
  "outDir": "$OUT_DIR"
}
JSON

run_phase "canonical-success" 1 "$SUCCESS_SCENARIO" "$CANON_LANE2_DIR" "$CANON_SUMMARY" "$CANON_OPERATOR_VIEW" "$CANON_STAGES_DIR"
run_phase "failure" 1 "$FAILURE_SCENARIO" "$FAIL_LANE2_DIR" "$FAIL_SUMMARY" "$FAIL_OPERATOR_VIEW" "$FAIL_STAGES_DIR"
run_phase "retry" 2 "$RETRY_SCENARIO" "$RETRY_LANE2_DIR" "$RETRY_SUMMARY" "$RETRY_OPERATOR_VIEW" "$RETRY_STAGES_DIR"

all_artifacts=(
  "$CANON_GENERATION"
  "$CANON_QA"
  "$CANON_OPERATOR"
  "$FAIL_GENERATION"
  "$FAIL_QA"
  "$FAIL_OPERATOR"
  "$RETRY_GENERATION"
  "$RETRY_QA"
  "$RETRY_OPERATOR"
)

# Deterministic continuity assertion across all stage artifacts.
if ! jq -sre --arg expected "$CHAIN_ID" '
  map(.chainContextId) as $ids
  | ($ids | length) == 9
    and ($ids | all(. == $expected))
    and (($ids | unique | length) == 1)
' "${all_artifacts[@]}" >/dev/null; then
  echo "[FAIL] chain context continuity assertion failed across stage artifacts (expected $CHAIN_ID)" >&2
  exit 1
fi

CANON_OPERATOR_STATUS="$(jq -r '.status' "$CANON_OPERATOR")"
FAIL_OPERATOR_STATUS="$(jq -r '.status' "$FAIL_OPERATOR")"
RETRY_OPERATOR_STATUS="$(jq -r '.status' "$RETRY_OPERATOR")"

if [[ "$FAIL_OPERATOR_STATUS" != "blocked" ]]; then
  echo "[FAIL] failure path operator status must be blocked (got '$FAIL_OPERATOR_STATUS')" >&2
  exit 1
fi

if [[ "$SUCCESS_SCENARIO" == "verified-peer" && "$CANON_OPERATOR_STATUS" != "ready" ]]; then
  echo "[FAIL] canonical success must be ready for verified-peer (got '$CANON_OPERATOR_STATUS')" >&2
  exit 1
fi

if [[ "$RETRY_SCENARIO" == "verified-peer" && "$RETRY_OPERATOR_STATUS" != "ready" ]]; then
  echo "[FAIL] retry must be ready for verified-peer (got '$RETRY_OPERATOR_STATUS')" >&2
  exit 1
fi

cat >"$ASSERTIONS_JSON" <<JSON
{
  "artifactKind": "mus71-dual-gpu-chain-assertions-v1",
  "generatedAt": "$NOW",
  "chainContextId": "$CHAIN_ID",
  "checks": {
    "chainContextContinuity": true,
    "canonicalOperatorStatus": "$CANON_OPERATOR_STATUS",
    "failureOperatorStatus": "$FAIL_OPERATOR_STATUS",
    "retryOperatorStatus": "$RETRY_OPERATOR_STATUS"
  }
}
JSON

cat >"$MANIFEST_JSON" <<JSON
{
  "harness": "mus71-dual-gpu-chain-harness",
  "generated_at": "$NOW",
  "chain_context_id": "$CHAIN_ID",
  "scenarios": {
    "canonical_success": "$SUCCESS_SCENARIO",
    "failure": "$FAILURE_SCENARIO",
    "retry": "$RETRY_SCENARIO"
  },
  "artifacts": {
    "canonical_generation": "$CANON_GENERATION",
    "canonical_qa_tagging": "$CANON_QA",
    "canonical_operator_review": "$CANON_OPERATOR",
    "failure_generation": "$FAIL_GENERATION",
    "failure_qa_tagging": "$FAIL_QA",
    "failure_operator_review": "$FAIL_OPERATOR",
    "retry_generation": "$RETRY_GENERATION",
    "retry_qa_tagging": "$RETRY_QA",
    "retry_operator_review": "$RETRY_OPERATOR",
    "assertions": "$ASSERTIONS_JSON"
  }
}
JSON

if ! jq -re --arg expected "$CHAIN_ID" '.chain_context_id == $expected' "$MANIFEST_JSON" >/dev/null; then
  echo "[FAIL] manifest chain_context_id mismatch (expected $CHAIN_ID)" >&2
  exit 1
fi

cat >"$REPLAY_TABLE_MD" <<MD
# MUS-71 Replay Table

| Command | Expected Exit | Actual Exit | Assertion Checks | Artifact Paths |
|---|---|---|---|---|
| \`cd $ROOT_DIR && ./scripts/mus71-dual-gpu-chain-harness.sh --chain-id $CHAIN_ID\` | \`0\` | \`0\` | Harness run succeeds and emits canonical/failure/retry artifacts | \`$MANIFEST_JSON\`, \`$ASSERTIONS_JSON\` |
| \`jq -sre --arg expected "$CHAIN_ID" 'map(.chainContextId) as \$ids | (\$ids|length)==9 and (\$ids|all(.==\$expected)) and ((\$ids|unique|length)==1)' $CANON_GENERATION $CANON_QA $CANON_OPERATOR $FAIL_GENERATION $FAIL_QA $FAIL_OPERATOR $RETRY_GENERATION $RETRY_QA $RETRY_OPERATOR >/dev/null && jq -re --arg expected "$CHAIN_ID" '.chain_context_id == \$expected' $MANIFEST_JSON >/dev/null\` | \`0\` | \`0\` | Fails if any stage artifact or manifest chain id diverges from \`$CHAIN_ID\` | stage artifacts listed in manifest + \`$MANIFEST_JSON\` |
| \`jq -r '.status' $FAIL_OPERATOR $RETRY_OPERATOR\` | \`0\` | \`0\` | first line \`blocked\`, second line \`ready\` (default scenarios) | \`$FAIL_OPERATOR\`, \`$RETRY_OPERATOR\` |
MD

echo "[OK] MUS-71 dual GPU chain harness artifacts generated"
echo "  - chain context id: $CHAIN_ID"
echo "  - canonical operator artifact: $CANON_OPERATOR"
echo "  - failure operator artifact:   $FAIL_OPERATOR"
echo "  - retry operator artifact:     $RETRY_OPERATOR"
echo "  - assertions:                  $ASSERTIONS_JSON"
echo "  - manifest:                    $MANIFEST_JSON"
echo "  - replay table:                $REPLAY_TABLE_MD"
echo "  - invocation:                  $INVOCATION_JSON"
