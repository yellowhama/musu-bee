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

# V23.4 T2-Z / F-A1c-9 (wiki/443): widen schema to full wiki/385 §5.6 spec.
# Adds RSS sampling, cold-start loop, host-environment metadata, and an
# outer-tar sha256 stitch over the final report-payload so the consumer can
# verify the report was not edited between bench-run and analysis.
# Backward-compat: every field present in v1 is preserved at the same path;
# new fields are additive under `metadata`, `rss_kb`, `cold_start_ms`, and
# `payload_sha256` (computed last over the rendered JSON).

# Cold-start sampling. Restart the bridge Pod N_COLD times and measure the
# time from `delete pod` to `Ready` so we capture the worst-case startup
# latency distribution. Bench is local-cluster so each restart is cheap.
N_COLD="${BENCH_COLD_RESTARTS:-3}"
COLD_LATENCIES_MS="[]"
echo "[bridge-bench] cold-start sampling: ${N_COLD} restart(s)" >&2
for c in $(seq 1 "$N_COLD"); do
  COLD_START_MS=$(date +%s%3N)
  $KUBECTL -n "$NAMESPACE" delete pod -l app=musu-bridge --wait=true >&2 || true
  $KUBECTL -n "$NAMESPACE" wait --for=condition=Ready pod \
    -l app=musu-bridge --timeout=120s >&2 || true
  COLD_END_MS=$(date +%s%3N)
  COLD_ELAPSED=$(( COLD_END_MS - COLD_START_MS ))
  COLD_LATENCIES_MS=$(echo "$COLD_LATENCIES_MS" | jq --argjson v "$COLD_ELAPSED" '. + [$v]')
  echo "[bridge-bench]   cold ${c}/${N_COLD}: ${COLD_ELAPSED} ms" >&2
done

# RSS sampling on the running bridge pod (post-cold). `ps -o rss=` runs
# inside the container so the value is the bridge PID's RSS in KB.
BRIDGE_POD="$($KUBECTL -n "$NAMESPACE" get pod -l app=musu-bridge \
  -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")"
RSS_KB="null"
if [ -n "$BRIDGE_POD" ]; then
  # uvicorn workers + master; sum RSS across all PIDs in the container.
  RSS_KB=$($KUBECTL -n "$NAMESPACE" exec "$BRIDGE_POD" -- \
    sh -c "ps -e -o rss= 2>/dev/null | awk 'BEGIN{s=0}{s+=\$1}END{print s}'" \
    2>/dev/null || echo "null")
  if [ -z "$RSS_KB" ]; then RSS_KB="null"; fi
fi

# Host environment metadata for the report consumer.
BENCH_VERSION="v23.4-z4-schema-v2"
K3S_VERSION="$($KUBECTL version --output=json 2>/dev/null | jq -r '.serverVersion.gitVersion // "unknown"' 2>/dev/null || echo "unknown")"
KERNEL_VERSION="$(uname -r 2>/dev/null || echo "unknown")"
CGROUP_DRIVER="$($CRICTL info 2>/dev/null | jq -r '.config.systemdCgroup // "unknown"' 2>/dev/null || echo "unknown")"
BENCH_TS_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "unknown")"

# Render the report JSON to a temp file first so we can hash it before
# emitting to stdout (the sha256 over the payload becomes part of the final
# report on stdout — payload_sha256 covers everything EXCEPT itself).
REPORT_TMP=$(mktemp)
trap 'rm -f "$REPORT_TMP"' EXIT
echo "${ALL_RESULTS}" | jq \
  --arg bench_version "$BENCH_VERSION" \
  --arg k3s_version "$K3S_VERSION" \
  --arg kernel_version "$KERNEL_VERSION" \
  --arg cgroup_driver "$CGROUP_DRIVER" \
  --arg bench_ts_utc "$BENCH_TS_UTC" \
  --argjson cold_start_ms "$COLD_LATENCIES_MS" \
  --argjson rss_kb "$RSS_KB" \
  '{
    schema: "musu-bridge-bench-v2",
    schema_v1_compat: true,
    wiki_id: 443,
    sub_ws: "v23.4-z4",
    metadata: {
      bench_version: $bench_version,
      bench_ts_utc: $bench_ts_utc,
      k3s_version: $k3s_version,
      kernel_version: $kernel_version,
      cgroup_driver: $cgroup_driver
    },
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
          p99_ms_median: (map(.runs[0].p99_ms) | sort | .[(length/2|floor)]),
          rss_kb: $rss_kb,
          cold_start_ms: $cold_start_ms,
          cold_start_p50_ms: ($cold_start_ms | sort | .[(length/2|floor)]),
          cold_start_max_ms: ($cold_start_ms | max)
        })
  }' > "$REPORT_TMP"

# Stitch outer sha256 over the report payload itself. The hash COVERS the
# entire JSON above (sorted-keys, no trailing newline) so downstream tooling
# can verify the report was not mutated in transit.
PAYLOAD_SHA="$(jq -S -c . < "$REPORT_TMP" | sha256sum | awk '{print $1}')"
jq --arg sha "$PAYLOAD_SHA" '. + {payload_sha256: $sha}' "$REPORT_TMP"
