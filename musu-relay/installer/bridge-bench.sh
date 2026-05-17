#!/usr/bin/env bash
# bridge-bench.sh — V23.3 A1.c / wiki/384
#
# Const VI bench: K3s-Pod musu-bridge latency/throughput against pinned
# thresholds in wiki/384 §4. Runs entirely inside the cluster via an
# ephemeral bench Pod (musu-relay/installer/bench-pod.yaml).
#
# Output: JSON to stdout following V23_1_SPIKE_RESULT_TEMPLATE §2 schema +
# A1.c extension fields (per-run p99, aggregate medians, runs[]).
#
# Critic-resolved behaviors (wiki/384 §11):
#   - C-A1c-H1: brackets bench with `kubectl set env MUSU_DISABLE_RATE_LIMIT=1`
#     on the bridge Deployment; reverts via EXIT trap so an abort does not
#     leave production with rate limit disabled.
#   - C-A1c-L6: precheck `crictl images` for python:3.11-slim; abort if
#     missing (bench Pod's imagePullPolicy:IfNotPresent would silently fall
#     into ImagePullBackOff against the air-gapped image cache).
#   - Builder NEW-MED-1: EXIT trap does BOTH the env-revert AND a
#     `rollout status` wait so we never exit while the bridge is mid-rollout
#     from the env-revert ReplicaSet swap.
#
# Usage:
#   ./bridge-bench.sh [RUNS]          # default RUNS=3
#
# Exit codes:
#   0  bench completed; caller compares JSON against §4 thresholds
#   1  preflight / pod failed to start / pod did not Succeed
#   2  bench pod ran but produced no parseable JSON result
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POD_YAML="$SCRIPT_DIR/bench-pod.yaml"
NAMESPACE="musu"
POD_NAME="musu-bridge-bench"
KUBECTL="kubectl --kubeconfig ${KUBECONFIG:-/etc/rancher/k3s/k3s.yaml}"
CRICTL="${CRICTL:-crictl --runtime-endpoint unix:///run/k3s/containerd/containerd.sock}"
RUNS="${1:-3}"

# Auditor B-M5: §4.1 verdict logic (PASS/FAIL/AMBIGUOUS) presumes 3-run sample.
# Off-protocol RUNS values break median-of-3 jq indexing at line 110 and produce
# silently-overstated p99. Hard-gate to RUNS=3 until V23.4 widens verdict spec.
if [ "$RUNS" != "3" ]; then
  echo "[bridge-bench] FAIL: §4.1 verdict logic requires RUNS=3 (got '$RUNS')" >&2
  exit 1
fi

echo "[bridge-bench] preflight: python:3.11-slim present in airgap image cache?" >&2
if ! $CRICTL images 2>/dev/null | grep -E '(^|/)python\s+3\.11-slim' >/dev/null \
   && ! $CRICTL images 2>/dev/null | grep -E 'docker\.io/library/python.*3\.11-slim' >/dev/null; then
  echo "[bridge-bench] FAIL: python:3.11-slim not in containerd cache (crictl images)." >&2
  echo "                Bench Pod imagePullPolicy:IfNotPresent will not pull from remote." >&2
  echo "                Confirm A1.a airgap image set includes python:3.11-slim." >&2
  exit 1
fi

echo "[bridge-bench] preflight: musu-bridge Pod Ready?" >&2
$KUBECTL -n "$NAMESPACE" wait --for=condition=Ready pod \
  -l app=musu-bridge --timeout=60s >&2

echo "[bridge-bench] C-A1c-H1: disabling rate-limit on musu-bridge for bench window" >&2
$KUBECTL -n "$NAMESPACE" set env deploy/musu-bridge MUSU_DISABLE_RATE_LIMIT=1 >&2
# Builder NEW-MED-1: EXIT trap does both revert AND rollout-status wait so we
# never exit while bridge is mid-rollout from the env-revert ReplicaSet swap.
# Order matters: revert first (kicks rollout), then wait for that rollout.
trap '$KUBECTL -n '"$NAMESPACE"' set env deploy/musu-bridge MUSU_DISABLE_RATE_LIMIT- >&2 || true; $KUBECTL -n '"$NAMESPACE"' rollout status deploy/musu-bridge --timeout=120s >&2 || true' EXIT

# Wait for the rate-limit-set rollout before we start hitting the bridge.
$KUBECTL -n "$NAMESPACE" rollout status deploy/musu-bridge --timeout=120s >&2
$KUBECTL -n "$NAMESPACE" wait --for=condition=Ready pod \
  -l app=musu-bridge --timeout=60s >&2

ALL_RESULTS="[]"
for run in $(seq 1 "$RUNS"); do
  echo "[bridge-bench] run ${run}/${RUNS}" >&2
  $KUBECTL -n "$NAMESPACE" delete pod "$POD_NAME" --ignore-not-found --wait=true >&2
  $KUBECTL apply -f "$POD_YAML" >&2

  PHASE="Pending"
  for _ in $(seq 1 120); do
    PHASE=$($KUBECTL -n "$NAMESPACE" get pod "$POD_NAME" \
              -o jsonpath='{.status.phase}' 2>/dev/null || echo "Pending")
    if [ "$PHASE" = "Succeeded" ] || [ "$PHASE" = "Failed" ]; then
      break
    fi
    sleep 5
  done

  if [ "$PHASE" != "Succeeded" ]; then
    echo "[bridge-bench] FAIL: pod phase=${PHASE} after ~10min" >&2
    $KUBECTL -n "$NAMESPACE" logs "$POD_NAME" >&2 || true
    $KUBECTL -n "$NAMESPACE" delete pod "$POD_NAME" --ignore-not-found >&2 || true
    exit 1
  fi

  RESULT_JSON=$($KUBECTL -n "$NAMESPACE" logs "$POD_NAME" | tail -1)
  if ! echo "${RESULT_JSON}" | jq . >/dev/null 2>&1; then
    echo "[bridge-bench] unparseable result on run ${run}" >&2
    echo "${RESULT_JSON}" >&2
    exit 2
  fi
  ALL_RESULTS=$(echo "$ALL_RESULTS" "$RESULT_JSON" | jq -s '.[0] + [.[1]]')
  $KUBECTL -n "$NAMESPACE" delete pod "$POD_NAME" --ignore-not-found >&2 || true
done

# Aggregate JSON: V23_1_SPIKE_RESULT_TEMPLATE §2 schema + A1.c extensions.
# Auditor B-H2: emit success_rate_pct + gate_eligible so §4.1 verdict logic can
# precondition on §5.5 (must be ≥99.5% to count). Auditor B-H1: schema is
# minimal-by-design for A1.c per Option (b); RSS + cold-start + metadata
# enrichment is V23.4 forward-pointer F-A1c-9 (operator stitches into wiki/385).
echo "${ALL_RESULTS}" | jq '{
  schema: "musu-bridge-bench-v1",
  wiki_id: 385,
  sub_ws: "v23.3-a1c",
  runs: .,
  aggregate: ((map(.runs[0].n) | add) as $n_total
    | (map(.runs[0].success) | add) as $succ_total
    | {
        n_attempts: $n_total,
        success: $succ_total,
        fail: (map(.runs[0].fail) | add),
        success_rate_pct: ($succ_total / $n_total * 100),
        gate_eligible: (($succ_total / $n_total * 100) >= 99.5),
        p50_ms_median: (map(.runs[0].p50_ms) | sort | .[(length/2|floor)]),
        p95_ms_median: (map(.runs[0].p95_ms) | sort | .[(length/2|floor)]),
        p99_ms_median: (map(.runs[0].p99_ms) | sort | .[(length/2|floor)])
      })
}'
