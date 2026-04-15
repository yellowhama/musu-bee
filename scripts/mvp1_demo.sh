#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
MUS27_SCRIPT="$ROOT_DIR/scripts/mus27-live-session-harness.sh"

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/mvp1_demo.sh [out_dir]
  ./scripts/mvp1_demo.sh --message "<text>" --target-label "<label>" [out_dir]
  ./scripts/mvp1_demo.sh --scenario <verified-peer|unverified-peer|blocked-peer> [out_dir]
  ./scripts/mvp1_demo.sh --mode <auto|live|fixture> [out_dir]

Examples:
  ./scripts/mvp1_demo.sh
  ./scripts/mvp1_demo.sh /tmp/mvp1-demo
  ./scripts/mvp1_demo.sh --message "analyze image" --target-label "5070Ti"
  ./scripts/mvp1_demo.sh --mode fixture
USAGE
}

OUT_DIR="$ROOT_DIR/work/mvp1-demo"
OUT_DIR_EXPLICIT=false
MESSAGE="${MUSU_MVP1_MESSAGE:-analyze image}"
SCENARIO="${MUSU_MVP1_SCENARIO:-verified-peer}"
TARGET_LABEL="${MUSU_MVP1_TARGET_LABEL:-5070Ti}"
TARGET_PEER_ID="${MUSU_MVP1_TARGET_PEER_ID:-peer-5070ti}"
TARGET_DEVICE_ID="${MUSU_MVP1_TARGET_DEVICE_ID:-device-5070ti}"
TARGET_DEVICE_PROFILE="${MUSU_MVP1_TARGET_DEVICE_PROFILE:-desktop-5070ti}"
MODE="${MUSU_MVP1_MODE:-auto}"
FIXTURE_JSON="${MUSU_MVP1_FIXTURE_JSON:-$ROOT_DIR/MUSU-CRT/mock/lane2_live_proof_fixture.json}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --message)
      [[ $# -ge 2 ]] || { echo "[FAIL] --message requires a value" >&2; exit 2; }
      MESSAGE="$2"
      shift 2
      ;;
    --scenario)
      [[ $# -ge 2 ]] || { echo "[FAIL] --scenario requires a value" >&2; exit 2; }
      SCENARIO="$2"
      shift 2
      ;;
    --target-label)
      [[ $# -ge 2 ]] || { echo "[FAIL] --target-label requires a value" >&2; exit 2; }
      TARGET_LABEL="$2"
      shift 2
      ;;
    --target-peer-id)
      [[ $# -ge 2 ]] || { echo "[FAIL] --target-peer-id requires a value" >&2; exit 2; }
      TARGET_PEER_ID="$2"
      shift 2
      ;;
    --target-device-id)
      [[ $# -ge 2 ]] || { echo "[FAIL] --target-device-id requires a value" >&2; exit 2; }
      TARGET_DEVICE_ID="$2"
      shift 2
      ;;
    --target-profile)
      [[ $# -ge 2 ]] || { echo "[FAIL] --target-profile requires a value" >&2; exit 2; }
      TARGET_DEVICE_PROFILE="$2"
      shift 2
      ;;
    --mode)
      [[ $# -ge 2 ]] || { echo "[FAIL] --mode requires a value" >&2; exit 2; }
      MODE="$2"
      shift 2
      ;;
    --fixture-json)
      [[ $# -ge 2 ]] || { echo "[FAIL] --fixture-json requires a value" >&2; exit 2; }
      FIXTURE_JSON="$2"
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

if [[ ! -x "$MUS27_SCRIPT" ]]; then
  echo "[FAIL] required script not found or not executable: $MUS27_SCRIPT" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "[FAIL] jq is required but not installed" >&2
  exit 1
fi

case "$SCENARIO" in
  verified-peer|unverified-peer|blocked-peer) ;;
  *)
    echo "[FAIL] invalid scenario '$SCENARIO' (expected verified-peer|unverified-peer|blocked-peer)" >&2
    exit 2
    ;;
esac

case "$MODE" in
  auto|live|fixture) ;;
  *)
    echo "[FAIL] invalid mode '$MODE' (expected auto|live|fixture)" >&2
    exit 2
    ;;
esac

mkdir -p "$OUT_DIR"
RUN_LOG="$OUT_DIR/mvp1-demo-run.log"
SUMMARY_JSON="$OUT_DIR/mvp1-demo-summary.json"
PROOF_JSON="$OUT_DIR/musu-connects-live-proof.json"

mode_used=""
round_trip_ms=0
live_error_message=""

if [[ "$MODE" != "fixture" ]]; then
  start_ms="$(date +%s%3N)"
  set +e
  MUSU_LANE2_PEER_ID="$TARGET_PEER_ID" \
  MUSU_LANE2_DEVICE_ID="$TARGET_DEVICE_ID" \
  MUSU_LANE2_DEVICE_LABEL="$TARGET_LABEL" \
  MUSU_LANE2_RUNTIME_PROFILE="$TARGET_DEVICE_PROFILE" \
  "$MUS27_SCRIPT" --scenario "$SCENARIO" "$OUT_DIR" 2>&1 | tee "$RUN_LOG"
  mus27_rc="${PIPESTATUS[0]}"
  set -e
  end_ms="$(date +%s%3N)"

  if [[ "$mus27_rc" -eq 0 && -f "$PROOF_JSON" ]]; then
    mode_used="live-mus27"
    round_trip_ms="$((end_ms - start_ms))"
  else
    live_error_message="[WARN] live lane-2 harness failed (exit=$mus27_rc); mode=$MODE"
    if [[ "$MODE" == "live" ]]; then
      echo "[FAIL] lane-2 harness failed with exit code $mus27_rc (see $RUN_LOG)" >&2
      exit "$mus27_rc"
    fi
  fi
fi

if [[ -z "$mode_used" ]]; then
  if [[ ! -f "$FIXTURE_JSON" ]]; then
    echo "[FAIL] fixture proof not found for fallback: $FIXTURE_JSON" >&2
    exit 1
  fi

  scenario_trust_level="trusted"
  scenario_discovery_state="verified"
  scenario_trust_gate_reason="peer-allowed"
  scenario_import_decision_reason="clean"
  scenario_transport_evidence_kind="runtime-musu-port-http-route-plane-v1"
  scenario_session_evidence_mode="runtime-peer-authenticated"
  scenario_session_remote_addr_source="quic-session-event.remote_addr"

  case "$SCENARIO" in
    verified-peer)
      ;;
    unverified-peer)
      scenario_trust_level="known"
      scenario_discovery_state="discovered"
      scenario_trust_gate_reason="peer-not-verified"
      scenario_import_decision_reason="trust-gate-suppressed"
      scenario_transport_evidence_kind="trust-gate-suppressed"
      scenario_session_evidence_mode="not-generated"
      scenario_session_remote_addr_source="none"
      ;;
    blocked-peer)
      scenario_trust_level="blocked"
      scenario_discovery_state="blocked"
      scenario_trust_gate_reason="peer-blocked"
      scenario_import_decision_reason="trust-gate-suppressed"
      scenario_transport_evidence_kind="trust-gate-suppressed"
      scenario_session_evidence_mode="not-generated"
      scenario_session_remote_addr_source="none"
      ;;
  esac

  fallback_start_ms="$(date +%s%3N)"
  jq \
    --arg targetPeerId "$TARGET_PEER_ID" \
    --arg targetLabel "$TARGET_LABEL" \
    --arg trustLevel "$scenario_trust_level" \
    --arg discoveryState "$scenario_discovery_state" \
    --arg trustGateReason "$scenario_trust_gate_reason" \
    --arg importDecisionReason "$scenario_import_decision_reason" \
    --arg transportEvidenceKind "$scenario_transport_evidence_kind" \
    --arg sessionEvidenceMode "$scenario_session_evidence_mode" \
    --arg sessionRemoteAddrSource "$scenario_session_remote_addr_source" \
    --arg now "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
    '
    .generated_at = $now
    | .trustLevel = $trustLevel
    | .discoveryState = $discoveryState
    | .trustGateReason = $trustGateReason
    | .importDecisionReason = $importDecisionReason
    | .transportEvidenceKind = $transportEvidenceKind
    | .sessionEvidenceMode = $sessionEvidenceMode
    | .sessionRemoteAddrSource = $sessionRemoteAddrSource
    | .snapshot.peer_id = $targetPeerId
    | .snapshot.trust_level = $trustLevel
    | .snapshot.discovery_state = $discoveryState
    | .snapshot.trust_gate_reason = $trustGateReason
    | .snapshot.import_decision_reason = $importDecisionReason
    | .snapshot.transport_evidence_kind = $transportEvidenceKind
    | .snapshot.session_evidence_mode = $sessionEvidenceMode
    | .snapshot.session_remote_addr_source = $sessionRemoteAddrSource
    | .snapshot.quic_session.peer_id = $targetPeerId
    | .snapshot.quic_session.remote_addr = ($targetPeerId + ".mesh.internal:4433")
    ' \
    "$FIXTURE_JSON" >"$PROOF_JSON"
  fallback_end_ms="$(date +%s%3N)"
  round_trip_ms="$((fallback_end_ms - fallback_start_ms))"
  if [[ "$round_trip_ms" -lt 1 ]]; then
    round_trip_ms=1
  fi
  mode_used="fixture-fallback"
  {
    echo "[MVP1] fixture fallback: $FIXTURE_JSON"
    [[ -n "$live_error_message" ]] && echo "$live_error_message"
  } >"$RUN_LOG"
  [[ -n "$live_error_message" ]] && echo "$live_error_message" >&2
fi

trust_gate_reason="$(jq -r '.trustGateReason // "unknown"' "$PROOF_JSON")"
import_decision_reason="$(jq -r '.importDecisionReason // "unknown"' "$PROOF_JSON")"
session_id="$(jq -r '.snapshot.pairing_session_id // .snapshot.quic_session.session_id // "none"' "$PROOF_JSON")"
remote_addr="$(jq -r '.snapshot.quic_session.remote_addr // "none"' "$PROOF_JSON")"
transport_evidence_kind="$(jq -r '.transportEvidenceKind // "unknown"' "$PROOF_JSON")"
selected_service="$(jq -r '.selected_service // "unknown"' "$PROOF_JSON")"

if [[ "$trust_gate_reason" == "peer-allowed" && "$import_decision_reason" == "clean" ]]; then
  forward_decision="forward_to_${TARGET_LABEL}"
  stub_result="stub-result: ${TARGET_LABEL} accepted '${MESSAGE}' and returned canned analysis"
else
  forward_decision="not_forwarded_${trust_gate_reason}"
  stub_result="stub-result: no remote inference result (trust gate blocked forwarding)"
fi

generated_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
jq -n \
  --arg generatedAt "$generated_at" \
  --arg message "$MESSAGE" \
  --arg scenario "$SCENARIO" \
  --arg targetLabel "$TARGET_LABEL" \
  --arg targetPeerId "$TARGET_PEER_ID" \
  --arg mode "$mode_used" \
  --arg selectedService "$selected_service" \
  --arg forwardDecision "$forward_decision" \
  --arg trustGateReason "$trust_gate_reason" \
  --arg importDecisionReason "$import_decision_reason" \
  --arg sessionId "$session_id" \
  --arg remoteAddr "$remote_addr" \
  --arg transportEvidenceKind "$transport_evidence_kind" \
  --arg stubResult "$stub_result" \
  --arg proofJson "$PROOF_JSON" \
  --arg runLog "$RUN_LOG" \
  --argjson roundTripMs "$round_trip_ms" \
  '{
    harness: "mvp1-demo",
    generated_at: $generatedAt,
    message: $message,
    scenario: $scenario,
    target: {
      label: $targetLabel,
      peer_id: $targetPeerId
    },
    mode: $mode,
    selected_service: $selectedService,
    forward_decision: $forwardDecision,
    trust_gate_reason: $trustGateReason,
    import_decision_reason: $importDecisionReason,
    session_id: $sessionId,
    remote_addr: $remoteAddr,
    transport_evidence_kind: $transportEvidenceKind,
    round_trip_ms: $roundTripMs,
    result: $stubResult,
    artifacts: {
      proof_json: $proofJson,
      run_log: $runLog
    }
  }' >"$SUMMARY_JSON"

echo
echo "[MVP1] message: $MESSAGE"
echo "[MVP1] target: $TARGET_LABEL ($TARGET_PEER_ID)"
echo "[MVP1] mode: $mode_used"
echo "[MVP1] selected_service: $selected_service"
echo "[MVP1] forward_decision: $forward_decision (trust_gate_reason=$trust_gate_reason, import_decision_reason=$import_decision_reason)"
echo "[MVP1] round_trip_ms: $round_trip_ms"
echo "[MVP1] result: $stub_result"
echo "[MVP1] session_id: $session_id"
echo "[MVP1] remote_addr: $remote_addr"
echo "[MVP1] transport_evidence_kind: $transport_evidence_kind"
echo "[MVP1] summary: $SUMMARY_JSON"
echo "[MVP1] proof:   $PROOF_JSON"
echo "[MVP1] log:     $RUN_LOG"
