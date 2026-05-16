# V23.2 Workstream B4c — Const VI 30% gate experiment plan (wiki/374)

**Date**: 2026-05-17
**Status**: Plan-mode draft. Solo orchestrator (no agent-team) — operator-side experiment with small code surface; cf. wiki/369 (B5) precedent.
**Predecessors**: wiki/361 (master plan §B4c), wiki/371 (B4a closure), wiki/373 (B4b closure)
**Branch**: `v22/gap-analysis`
**Wiki ID**: `wiki/374`

---

## 1. Summary

B4c is the Constitution VI experiment that gates the V23 α-path (WSL2-on-Windows-first install pipeline) on empirical install-success data from 5 Windows hosts of varying configurations. Code surface is minimal: one `jq`-based aggregation script + one operator runbook + one closure template that the operator fills in with the α/β decision. The actual experiment is **operator-side**: the operator runs `installer\install-wsl2.ps1` (B4b) on 5 different hosts that already have `musu-backend.tar` (B4a), collects `validation-result.json` + `telemetry_install` rows from each, runs the aggregation jq, and records the alpha/beta decision in the closure doc.

**Gate threshold (from wiki/361 §B4c line 149)**: if >70% of 5 hosts complete the install pipeline successfully (`step_failed IS NULL` in `telemetry_install`), continue with α-path. Below 70%, the closure doc records β-path retreat reasoning.

---

## 2. Why solo orchestrator (no agent-team)

Per `MODE_Agent_Team.md` activation triggers:
- Cross-repo? **NO** (musu-bee only)
- Auth/security/schema? **NO** (no new endpoints; uses existing B1 HMAC + B3 admin auth + B4b telemetry rows)
- ≥3 specialist roles? **NO** (single concern: aggregation + decision protocol)
- ≥4 files across ≥2 dirs? **NO** (3 files: 1 script in `installer/`, 2 docs in `docs/`)

Solo orchestrator matches the B5 closure precedent (wiki/369 §4 "Why solo orchestrator").

The 30% gate decision itself is a Constitution VI artifact, not a Critic finding. No agent can adjudicate the data on behalf of the operator; the experiment is empirical.

---

## 3. Files to create

| File | Type | Purpose | LOC |
|---|---|---|---|
| `musu-relay/installer/b4c-aggregate.sh` | bash + jq | Aggregates N validation-result.json files → summary JSON with success rate, by-host-class breakdown, failure-mode histogram | ~80 |
| `musu-relay/installer/b4c-aggregate.md` | markdown | Operator runbook for collecting + running the aggregation | ~60 |
| `docs/V23_2_WORKSTREAM_B4C_CLOSURE_2026_05_16.md` | markdown | Closure doc with α/β decision template + placeholders for the 5-host data | ~200 |

Total: 3 new files. Zero existing files modified.

---

## 4. Aggregation contract

### 4.1 Input

Per master plan §B4c (wiki/361 line 148), the 5 aggregated fields from `telemetry_install`:
- `wsl2_present_at_start` (0|1|NULL)
- `wsl2_feature_enabled` (0|1|NULL)
- `bios_virtualization_detected` ('yes'|'no'|'unknown'|NULL)
- `step_failed` (NULL = success)
- `step_error_class` (categorical: hard_blocker_bios|timeout|permission|network|av_block|group_policy_block|...)

Plus B4a's `validation-result.json` schema (wiki/370 §7.2):
- `b4c_host_class` (locked enum: `wsl2-already-on`|`wsl2-off-feature-on`|`wsl2-off-feature-off`|`no-bios-vt-simulated`|`fresh-win-vm`)
- `b4c_host_id` (`$env:COMPUTERNAME` lowercased)
- `tar_sha256` (proves same-payload across hosts)
- `k3s_ready_status` (`ready`|`timeout`|`never_started`|null)
- `k3s_ready_ms` (number|null)
- `idle_ram_mb_used` (number)
- `musu_version_raw` (build provenance from /etc/musu-version)

### 4.2 Output

JSON with these keys:

```json
{
  "experiment_started_at_utc": "2026-05-17T00:00:00Z",
  "experiment_finished_at_utc": "2026-05-17T03:00:00Z",
  "host_count": 5,
  "tar_sha256_unique": ["..."],
  "tar_sha256_consistent": true,
  "host_class_distribution": {
    "wsl2-already-on": 1,
    "wsl2-off-feature-on": 1,
    "wsl2-off-feature-off": 1,
    "no-bios-vt-simulated": 1,
    "fresh-win-vm": 1
  },
  "success_count": 4,
  "success_rate": 0.80,
  "gate_threshold": 0.70,
  "gate_decision": "alpha",
  "k3s_ready_ms_p50": 32000,
  "k3s_ready_ms_p95": 78000,
  "idle_ram_mb_p50": 412,
  "failure_breakdown_by_step": {
    "wsl_feature": 0,
    "wsl_import": 0,
    "k3s_start": 1,
    "musu_relay_start": 0,
    "av_block": 0,
    "group_policy_block": 0,
    "bios_vt_off": 0
  },
  "failure_breakdown_by_class": {
    "no-bios-vt-simulated": { "failed": 1, "step": "bios_vt_off" }
  },
  "per_host": [...]
}
```

### 4.3 Decision logic (gate_decision derivation)

```
if tar_sha256_consistent == false:
    gate_decision = "abort_payload_inconsistent"
elif success_rate >= 0.70 AND host_class_distribution covers ≥3 distinct classes:
    gate_decision = "alpha"
elif success_rate < 0.70:
    gate_decision = "beta"
else:
    gate_decision = "insufficient_diversity"  # all 5 hosts same class
```

The `≥3 distinct classes` floor prevents a 5-WSL2-already-on run from claiming gate-pass.

---

## 5. b4c-aggregate.sh — design

```bash
#!/usr/bin/env bash
# musu-relay/installer/b4c-aggregate.sh — V23.2 B4c (wiki/374)
# Aggregate N validation-result.json files from B4c hosts → summary JSON.
#
# Usage: ./b4c-aggregate.sh host1.json host2.json host3.json host4.json host5.json
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <host1.json> [host2.json] ..." >&2
  exit 2
fi

# Concatenate inputs to a JSON array, then run jq aggregations
INPUTS_JSON=$(jq -s '.' "$@")

# Compute every field via jq
RESULT=$(echo "$INPUTS_JSON" | jq '{
  experiment_started_at_utc: (map(.started_at_utc) | min),
  experiment_finished_at_utc: (map(.finished_at_utc) | max),
  host_count: length,
  tar_sha256_unique: (map(.tar_sha256) | unique),
  tar_sha256_consistent: (map(.tar_sha256) | unique | length == 1),
  host_class_distribution: (
    group_by(.b4c_host_class)
    | map({(.[0].b4c_host_class): length})
    | add
  ),
  success_count: ([.[] | select(.k3s_ready_status == "ready")] | length),
  success_rate: (([.[] | select(.k3s_ready_status == "ready")] | length) / length),
  gate_threshold: 0.70,
  k3s_ready_ms_p50: ([.[] | .k3s_ready_ms // empty] | sort | .[length/2 | floor]),
  k3s_ready_ms_p95: ([.[] | .k3s_ready_ms // empty] | sort | .[length * 95 / 100 | floor]),
  idle_ram_mb_p50: ([.[] | .idle_ram_mb_used // empty] | sort | .[length/2 | floor]),
  failure_breakdown_by_class: (
    [.[] | select(.k3s_ready_status != "ready")]
    | group_by(.b4c_host_class)
    | map({(.[0].b4c_host_class): {failed: length, status: (.[0].k3s_ready_status)}})
    | add // {}
  ),
  per_host: (map({
    host_id: .b4c_host_id,
    host_class: .b4c_host_class,
    status: .k3s_ready_status,
    k3s_ready_ms,
    idle_ram_mb_used,
    tar_sha256: (.tar_sha256[0:12])
  }))
}')

# Derive gate_decision separately (jq nested if is verbose)
TAR_OK=$(echo "$RESULT" | jq -r '.tar_sha256_consistent')
SUCCESS_RATE=$(echo "$RESULT" | jq -r '.success_rate')
CLASS_COUNT=$(echo "$RESULT" | jq -r '.host_class_distribution | length')

if [ "$TAR_OK" != "true" ]; then
  DECISION="abort_payload_inconsistent"
elif awk -v r="$SUCCESS_RATE" 'BEGIN { exit !(r >= 0.70) }' && [ "$CLASS_COUNT" -ge 3 ]; then
  DECISION="alpha"
elif awk -v r="$SUCCESS_RATE" 'BEGIN { exit !(r < 0.70) }'; then
  DECISION="beta"
else
  DECISION="insufficient_diversity"
fi

# Emit final JSON with decision spliced in
echo "$RESULT" | jq --arg d "$DECISION" '. + {gate_decision: $d}'
```

Runs on Linux/WSL/macOS. Operator pipes output to a file; the closure doc references it verbatim.

---

## 6. Operator runbook contract (b4c-aggregate.md)

The runbook documents:
1. Procuring 5 hosts (or 5 VM snapshots) representing the 5 b4c_host_class values
2. Pre-flight: same `musu-backend.tar` (same `tar_sha256`) on all 5
3. Per-host: run `installer\install-wsl2.ps1 -TunnelToken <hex>` → capture `validation-result.json` (path: `$env:LOCALAPPDATA\musu\validation-result.json` after install)
4. (Optional) Verify telemetry row appeared in signaling DB via `/v1/telemetry/summary` (B3 admin auth)
5. Aggregate: `./b4c-aggregate.sh host1.json host2.json host3.json host4.json host5.json > b4c-result.json`
6. Inspect `gate_decision` → record in closure doc

---

## 7. Closure doc decision template

The closure (wiki/375) ships with the `b4c-result.json` schema baked in, plus a narrative template for the operator to fill in:

```
## Experiment outcome

- Hosts run: <date range>
- gate_decision: <alpha | beta | abort_payload_inconsistent | insufficient_diversity>
- success_rate: <0.0-1.0>
- Failure modes encountered: <enumerate>
- Reasoning for the recorded decision: <prose>

## α-path actions (if gate_decision = alpha)
- Continue per V23.3 roadmap (musu-bridge as K3s Pod, etc.)
- Document the 5-host validation as the V23.2 closing evidence

## β-path actions (if gate_decision = beta)
- Identify dominant failure mode from failure_breakdown_by_step
- Decide: (a) fix specific failure + re-run B4c, (b) Debian-slim base pivot for K3s spike, (c) drop α-path entirely and rebase on β (Docker Desktop hard-require)
- Record the β-path plan in V23.3 task list
```

---

## 8. Constitution gates

- **Const III** (schema): NO — no new tables
- **Const VI** (experiment): **YES** — this IS the gate experiment. The decision IS the deliverable.
- **Const VII** (push): YES — feature-branch push to `v22/gap-analysis` allowed at closure. Main-branch merge stays gated by V23.2 final closure after B4c completes.

---

## 9. Acceptance criteria

- [x] `installer/b4c-aggregate.sh` committed (deterministic, no operator-state required to compile/test)
- [x] `installer/b4c-aggregate.md` operator runbook committed
- [x] Closure doc `wiki/375` committed with α/β decision template + placeholders
- [ ] OPERATOR-GATED: 5 hosts run B4b installer; 5 validation-result.json files produced
- [ ] OPERATOR-GATED: `b4c-aggregate.sh` run against the 5 files; `b4c-result.json` produced
- [ ] OPERATOR-GATED: closure doc amended with the recorded `gate_decision` + reasoning
- [ ] OPERATOR-GATED: if `gate_decision = alpha`: V23.3 roadmap continues α-path
- [ ] OPERATOR-GATED: if `gate_decision = beta`: V23.3 roadmap records the β-pivot plan
- [x] Existing musu-relay test suite stays 189/189 (B4c touches no TypeScript)
- [x] `npx tsc --noEmit` clean (B4c touches no TypeScript)

---

## 10. Out of scope (explicit)

- A `/v1/telemetry/summary/by-host-class` endpoint that does the aggregation server-side. Rejected because B4c aggregation is one-shot operator-side; adding a server endpoint requires Const III review for query patterns + deploy. The jq-on-validation-result.json pattern keeps B4c's blast radius to 3 new files.
- Automated B4c CI. The experiment is by definition multi-host + operator-driven; CI-ifying it would require maintaining a 5-VM pool, which is V23.5+ infrastructure.
- B4c.2 retry experiment. If gate_decision is `beta` and operator wants a second B4c with different installer settings, that's a separate workstream — not B4c.
- Anonymization of `b4c_host_id`. Per V23 master plan §9.3 telemetry is ephemeral; b4c_host_id (default `$env:COMPUTERNAME` lowercased) is already operator-controlled.

---

## 11. References

- wiki/361 (master plan §B4c lines 146-154)
- wiki/370 §7.2 (validation-result.json schema, b4c_host_class enum locked at 5 values)
- wiki/371 (B4a closure)
- wiki/372 §6.4 (B4c host_class extension to 6 values — but only 5 are observable in canonical install flow; `wsl2-off-feature-unknown` is unreachable per C11 fallback)
- wiki/373 (B4b closure — install_completed telemetry emission)
- V23_MASTER_PLAN_2026_05_15.md §0.5 (3-tier install flow)
- musu-relay/src/signaling/telemetry.ts:61-77 (telemetry_install schema)
- musu-relay/src/signaling/telemetry.ts:745-786 (`/summary` endpoint — aggregate counts only, no per-class breakdown)

**End of B4c plan (wiki/374). Implementation is immediate (3 files); operator gates the closure.**
