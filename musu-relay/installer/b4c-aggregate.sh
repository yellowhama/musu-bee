#!/usr/bin/env bash
# musu-relay/installer/b4c-aggregate.sh — V23.2 Workstream B4c (wiki/374)
#
# Aggregates N validation-result.json files from B4c hosts into a single
# summary JSON with success rate, host_class breakdown, failure histogram,
# and the alpha/beta gate decision.
#
# Usage:
#   ./b4c-aggregate.sh host1.json host2.json host3.json host4.json host5.json
#
# Output: JSON on stdout. Pipe to a file:
#   ./b4c-aggregate.sh *.json > b4c-result.json
#
# Gate threshold (wiki/361 §B4c line 149): >70% success → alpha; <70% → beta.
# Tar SHA-256 must match across all hosts (proves same-payload per B4a C4).
# Host_class diversity floor: ≥3 distinct b4c_host_class values to prevent
# a 5-WSL2-already-on run from claiming gate-pass.

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <host1.json> [host2.json] ..." >&2
  echo "Aggregates B4c validation-result.json files into a gate-decision summary." >&2
  exit 2
fi

for f in "$@"; do
  if [ ! -f "$f" ]; then
    echo "FATAL: $f not found" >&2
    exit 2
  fi
done

# Concatenate inputs to a JSON array
INPUTS_JSON=$(jq -s '.' "$@")

# Compute aggregate fields
RESULT=$(echo "$INPUTS_JSON" | jq '{
  experiment_started_at_utc: (map(.started_at_utc) | min),
  experiment_finished_at_utc: (map(.finished_at_utc) | max),
  host_count: length,
  tar_sha256_unique: (map(.tar_sha256) | unique),
  tar_sha256_consistent: (map(.tar_sha256) | unique | length == 1),
  host_class_distribution: (
    group_by(.b4c_host_class)
    | map({(.[0].b4c_host_class // "unknown"): length})
    | add
  ),
  success_count: ([.[] | select(.k3s_ready_status == "ready")] | length),
  success_rate: (
    if length == 0 then 0
    else ([.[] | select(.k3s_ready_status == "ready")] | length) / length
    end
  ),
  gate_threshold: 0.70,
  k3s_ready_ms_p50: (
    [.[] | .k3s_ready_ms // empty] | sort
    | if length == 0 then null else .[(length / 2) | floor] end
  ),
  k3s_ready_ms_p95: (
    [.[] | .k3s_ready_ms // empty] | sort
    | if length == 0 then null else .[(length * 95 / 100) | floor] end
  ),
  idle_ram_mb_p50: (
    [.[] | .idle_ram_mb_used // empty] | sort
    | if length == 0 then null else .[(length / 2) | floor] end
  ),
  failure_breakdown_by_class: (
    [.[] | select(.k3s_ready_status != "ready")]
    | group_by(.b4c_host_class // "unknown")
    | map({(.[0].b4c_host_class // "unknown"): {
        failed: length,
        statuses: (map(.k3s_ready_status) | unique)
      }})
    | add // {}
  ),
  per_host: (map({
    host_id: (.b4c_host_id // "unknown"),
    host_class: (.b4c_host_class // "unknown"),
    status: .k3s_ready_status,
    k3s_ready_ms: .k3s_ready_ms,
    idle_ram_mb_used: .idle_ram_mb_used,
    tar_sha256_prefix: (if .tar_sha256 then (.tar_sha256[0:12]) else null end),
    musu_version: (.musu_version_raw // null)
  }))
}')

# Derive gate_decision (jq nested-if for floats is brittle; use awk)
TAR_OK=$(echo "$RESULT" | jq -r '.tar_sha256_consistent')
SUCCESS_RATE=$(echo "$RESULT" | jq -r '.success_rate')
CLASS_COUNT=$(echo "$RESULT" | jq -r '.host_class_distribution | length')

if [ "$TAR_OK" != "true" ]; then
  DECISION="abort_payload_inconsistent"
elif awk -v r="$SUCCESS_RATE" 'BEGIN { exit !(r >= 0.70) }' \
     && [ "$CLASS_COUNT" -ge 3 ]; then
  DECISION="alpha"
elif awk -v r="$SUCCESS_RATE" 'BEGIN { exit !(r < 0.70) }'; then
  DECISION="beta"
else
  DECISION="insufficient_diversity"
fi

# Emit final JSON
echo "$RESULT" | jq --arg d "$DECISION" '. + {gate_decision: $d}'
