#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
RUST_ENV="$ROOT_DIR/scripts/linux-rust-env.sh"

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/mus27-live-session-harness.sh [out_dir]
  ./scripts/mus27-live-session-harness.sh --scenario <verified-peer|unverified-peer|blocked-peer> [out_dir]

Examples:
  ./scripts/mus27-live-session-harness.sh
  ./scripts/mus27-live-session-harness.sh --scenario blocked-peer
  ./scripts/mus27-live-session-harness.sh --scenario unverified-peer /tmp/mus27-proof-unverified
USAGE
}

SCENARIO="${MUSU_LANE2_SCENARIO:-verified-peer}"
OUT_DIR="${ROOT_DIR}/work/mus27-live-harness"
OUT_DIR_EXPLICIT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scenario)
      [[ $# -ge 2 ]] || { echo "[FAIL] --scenario requires a value" >&2; exit 2; }
      SCENARIO="$2"
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

if [[ "$OUT_DIR_EXPLICIT" == false && "$SCENARIO" != "verified-peer" ]]; then
  OUT_DIR="${ROOT_DIR}/work/mus27-live-harness-${SCENARIO}"
fi

PORT="${MUSU_LANE2_PORT:-18495}"
SERVICE="${MUSU_LANE2_SERVICE:-demo-api}"
NOW="${MUSU_LANE2_NOW:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"
SEED_SERVICES="${MUSU_LANE2_SEED_SERVICES:-$ROOT_DIR/musu-port/fixtures/sample_seed_services.json}"
DATA_ROOT="${MUSU_LANE2_DATA_ROOT:-$OUT_DIR/musu-port-data}"
LOG_PATH="$OUT_DIR/musu-portd.log"
HEALTH_JSON="$OUT_DIR/musu-port-health.json"
ROUTES_JSON="$OUT_DIR/musu-port-routes.json"
PROOF_JSON="$OUT_DIR/musu-connects-live-proof.json"
TRANSPORT_EVIDENCE_JSON="$OUT_DIR/musu-connects-runtime-transport-evidence.json"
MANIFEST_JSON="$OUT_DIR/mus27-live-harness-manifest.json"

TRUST_LEVEL="trusted"
DISCOVERY_STATE="verified"
case "$SCENARIO" in
  verified-peer)
    TRUST_LEVEL="trusted"
    DISCOVERY_STATE="verified"
    ;;
  unverified-peer)
    TRUST_LEVEL="known"
    DISCOVERY_STATE="discovered"
    ;;
  blocked-peer)
    TRUST_LEVEL="blocked"
    DISCOVERY_STATE="blocked"
    ;;
  *)
    echo "[FAIL] invalid scenario '$SCENARIO' (expected verified-peer|unverified-peer|blocked-peer)" >&2
    exit 2
    ;;
esac

PEER_ID="${MUSU_LANE2_PEER_ID:-peer-a}"
DEVICE_ID="${MUSU_LANE2_DEVICE_ID:-device-a}"
DEVICE_LABEL="${MUSU_LANE2_DEVICE_LABEL:-Workstation A}"
HOST_PLATFORM="${MUSU_LANE2_HOST_PLATFORM:-linux}"
RUNTIME_PROFILE="${MUSU_LANE2_RUNTIME_PROFILE:-desktop}"
DISCOVERED_VIA="${MUSU_LANE2_DISCOVERED_VIA:-live-harness}"

mkdir -p "$OUT_DIR"

cd "$ROOT_DIR/musu-port"
MUSU_PORT_MANAGER_HOST=127.0.0.1 \
MUSU_PORT_MANAGER_PORT="$PORT" \
MUSU_PORT_MANAGER_ALLOW_FALLBACK=false \
MUSU_PORT_SEED_SERVICES="$SEED_SERVICES" \
MUSU_PORT_DATA_ROOT="$DATA_ROOT" \
bash -lc "$RUST_ENV cargo run -q -p musu-portd" >"$LOG_PATH" 2>&1 &
PORT_PID=$!

cleanup() {
  kill "$PORT_PID" >/dev/null 2>&1 || true
  wait "$PORT_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for i in $(seq 1 80); do
  if curl -fsS "http://127.0.0.1:$PORT/health" >"$HEALTH_JSON" 2>/dev/null; then
    break
  fi
  sleep 0.25
  if ! kill -0 "$PORT_PID" 2>/dev/null; then
    echo "[FAIL] musu-portd exited before readiness" >&2
    sed -n '1,120p' "$LOG_PATH" >&2 || true
    exit 1
  fi
  if [[ "$i" -eq 80 ]]; then
    echo "[FAIL] timeout waiting for musu-portd readiness" >&2
    sed -n '1,120p' "$LOG_PATH" >&2 || true
    exit 1
  fi
done

curl -fsS "http://127.0.0.1:$PORT/routes" >"$ROUTES_JSON"

cd "$ROOT_DIR/musu-connects"
bash -lc "$RUST_ENV cargo run -q -p musu-connectsd -- live-harness --routes-json \"$ROUTES_JSON\" --proof-json \"$PROOF_JSON\" --service \"$SERVICE\" --now \"$NOW\" --peer-id \"$PEER_ID\" --device-id \"$DEVICE_ID\" --device-label \"$DEVICE_LABEL\" --host-platform \"$HOST_PLATFORM\" --runtime-profile \"$RUNTIME_PROFILE\" --discovered-via \"$DISCOVERED_VIA\" --trust-level \"$TRUST_LEVEL\" --discovery-state \"$DISCOVERY_STATE\" --runtime-evidence-path \"$TRANSPORT_EVIDENCE_JSON\""

python3 - "$PROOF_JSON" "$TRANSPORT_EVIDENCE_JSON" "$SCENARIO" "$HEALTH_JSON" "$ROUTES_JSON" "$LOG_PATH" "$PORT" <<'PY'
import json
import sys

proof_path, out_path, scenario, health_path, routes_path, log_path, manager_port = sys.argv[1:]

with open(proof_path, "r", encoding="utf-8") as fh:
    proof = json.load(fh)

snapshot = proof.get("snapshot", {})
entrypoint = (snapshot.get("exported_route") or {}).get("entrypoint") or {}
quic_session = snapshot.get("quic_session") or {}
trust_gate_reason = snapshot.get("trust_gate_reason")
import_decision_reason = snapshot.get("import_decision_reason")
transport_evidence_kind = snapshot.get("transport_evidence_kind")
session_evidence_mode = snapshot.get("session_evidence_mode")
session_remote_addr_source = snapshot.get("session_remote_addr_source")

if scenario == "verified-peer":
    expected = {
        "trust_gate_reason": "peer-allowed",
        "transport_evidence_kind": "runtime-musu-port-http-route-plane-v1",
        "session_evidence_mode": "runtime-peer-authenticated",
        "session_remote_addr_source": "quic-session-event.remote_addr",
    }
    if not snapshot.get("pairing_session_id"):
        raise SystemExit("verified-peer snapshot must include pairing_session_id")
    if not (quic_session.get("remote_addr") or "").strip():
        raise SystemExit("verified-peer snapshot must include runtime quic_session.remote_addr")
elif scenario == "unverified-peer":
    expected = {
        "trust_gate_reason": "peer-not-verified",
        "transport_evidence_kind": "trust-gate-suppressed",
        "session_evidence_mode": "not-generated",
        "session_remote_addr_source": "none",
    }
elif scenario == "blocked-peer":
    expected = {
        "trust_gate_reason": "peer-blocked",
        "transport_evidence_kind": "trust-gate-suppressed",
        "session_evidence_mode": "not-generated",
        "session_remote_addr_source": "none",
    }
else:
    raise SystemExit(f"unexpected scenario: {scenario}")

actual = {
    "trust_gate_reason": trust_gate_reason,
    "transport_evidence_kind": transport_evidence_kind,
    "session_evidence_mode": session_evidence_mode,
    "session_remote_addr_source": session_remote_addr_source,
}
for key, expected_value in expected.items():
    if actual.get(key) != expected_value:
        raise SystemExit(
            f"proof semantic mismatch for {key}: got={actual.get(key)!r} expected={expected_value!r}"
        )

for field_name, snapshot_key in (
    ("trustGateReason", "trust_gate_reason"),
    ("importDecisionReason", "import_decision_reason"),
    ("transportEvidenceKind", "transport_evidence_kind"),
    ("sessionEvidenceMode", "session_evidence_mode"),
    ("sessionRemoteAddrSource", "session_remote_addr_source"),
):
    if proof.get(field_name) != snapshot.get(snapshot_key):
        raise SystemExit(
            f"top-level proof field {field_name} diverges from snapshot.{snapshot_key}: "
            f"{proof.get(field_name)!r} != {snapshot.get(snapshot_key)!r}"
        )

endpoint = quic_session.get("endpoint_addr")
if endpoint is None:
    host = entrypoint.get("host")
    port = entrypoint.get("port")
    endpoint = f"{host}:{port}" if host is not None and port is not None else "<none>"

payload = {
    "schemaSemanticsVersion": "mus162-effective-transport-kind-v1",
    # MUS-103 acceptance contract keys.
    "kind": "runtime-musu-port-http-route-plane-v1",
    "session_id": quic_session.get("session_id") or "<none>",
    "peer_id": snapshot.get("peer_id") or "<none>",
    "endpoint": endpoint,
    "captured_at": proof.get("generated_at") or "<none>",
    # Canonical scenario-truthful transport evidence semantics.
    "effectiveTransportEvidenceKind": proof.get("transportEvidenceKind", "unknown"),
    "transportEvidenceKind": proof.get("transportEvidenceKind", "unknown"),
    # Legacy keys retained for backward compatibility.
    "legacyRuntimeTransportEvidenceKind": "runtime-musu-port-http-route-plane-v1",
    "proofTransportEvidenceKind": proof.get("transportEvidenceKind", "unknown"),
    "proofSessionEvidenceMode": proof.get("sessionEvidenceMode", "unknown"),
    "proofSessionRemoteAddrSource": proof.get("sessionRemoteAddrSource", "unknown"),
    "proofTrustGateReason": proof.get("trustGateReason", "unknown"),
    "proofImportDecisionReason": proof.get("importDecisionReason", "unknown"),
    "scenario": scenario,
    "capturedAt": proof.get("generated_at") or "<none>",
    "pairingOutcome": snapshot.get("pairing_outcome") or "<none>",
    "healthPath": health_path,
    "routesPath": routes_path,
    "portLogPath": log_path,
    "managerPort": int(manager_port),
}

with open(out_path, "w", encoding="utf-8") as fh:
    json.dump(payload, fh, indent=2)
    fh.write("\n")
PY

jq -n \
  --arg scenario "$SCENARIO" \
  --arg generatedAt "$NOW" \
  --arg service "$SERVICE" \
  --arg trustLevel "$TRUST_LEVEL" \
  --arg discoveryState "$DISCOVERY_STATE" \
  --arg health "$HEALTH_JSON" \
  --arg routes "$ROUTES_JSON" \
  --arg proof "$PROOF_JSON" \
  --arg runtimeTransportEvidence "$TRANSPORT_EVIDENCE_JSON" \
  --arg portLog "$LOG_PATH" \
  '{
    harness: "mus27-live-session-harness",
    scenario: $scenario,
    generated_at: $generatedAt,
    service: $service,
    trustLevel: $trustLevel,
    discoveryState: $discoveryState,
    artifacts: {
      health: $health,
      routes: $routes,
      proof: $proof,
      runtime_transport_evidence: $runtimeTransportEvidence,
      port_log: $portLog
    }
  }' >"$MANIFEST_JSON"

echo "[OK] MUS-27 live harness artifacts generated"
echo "  - scenario: $SCENARIO"
echo "  - trust:    $TRUST_LEVEL / $DISCOVERY_STATE"
echo "  - health:   $HEALTH_JSON"
echo "  - routes:   $ROUTES_JSON"
echo "  - proof:    $PROOF_JSON"
echo "  - runtime:  $TRANSPORT_EVIDENCE_JSON"
echo "  - manifest: $MANIFEST_JSON"
