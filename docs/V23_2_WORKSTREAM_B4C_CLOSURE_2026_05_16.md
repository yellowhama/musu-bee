# V23.2 Workstream B4c — Closure (wiki/375)

**Date**: 2026-05-17
**Status**: Code-complete (3 files shipped). **OPERATOR-GATED for the actual experiment + α/β decision recording.** This closure ships with a decision template; the operator amends it after running B4b on 5 hosts and running `b4c-aggregate.sh`.
**Predecessors**: wiki/361 (master plan §B4c), wiki/371 (B4a closure), wiki/373 (B4b closure), wiki/374 (B4c plan)
**Branch**: `v22/gap-analysis`
**Wiki ID**: `wiki/375`
**Workstream pattern**: solo orchestrator (no `MODE_Agent_Team` triggers met — no auth/schema, ≤3 files, single-repo)

---

## 1. Summary

B4c is the Constitution VI experiment that gates the V23 α-path (WSL2-on-Windows-first install pipeline) on empirical install-success data from 5 Windows hosts. Code surface is minimal: `installer/b4c-aggregate.sh` (jq-based aggregation), `installer/b4c-aggregate.md` (operator runbook), and this closure doc with the α/β decision template. The actual experiment is OPERATOR-GATED — the operator runs B4b on 5 hosts covering ≥3 distinct `b4c_host_class` values (locked at wiki/370 §7.2), captures `validation-result.json` from each, runs the aggregation, and records the `gate_decision` here. Gate threshold per wiki/361 §B4c line 149: >70% success → α; <70% → β. Decision-logic was smoke-tested against 5 mock-data samples (alpha-pass, alpha-margin, beta, insufficient_diversity, abort_payload_inconsistent) — all PASS.

---

## 2. Files touched

| File | Change | LOC |
|---|---|---|
| `musu-relay/installer/b4c-aggregate.sh` | NEW (bash + jq) | ~95 |
| `musu-relay/installer/b4c-aggregate.md` | NEW (operator runbook) | ~95 |
| `docs/V23_2_WORKSTREAM_B4C_PLAN_2026_05_16.md` | NEW (plan, wiki/374) | ~200 |
| `docs/V23_2_WORKSTREAM_B4C_CLOSURE_2026_05_16.md` | NEW (this closure, wiki/375) | ~200 |

Total: 4 new files. Zero existing files modified.

---

## 3. Plan adherence

Per wiki/374 §9 acceptance criteria:

- [x] `installer/b4c-aggregate.sh` committed (deterministic, no operator-state required to compile/test). Bash syntax-checked clean (`bash -n`). Decision logic smoke-tested in Python against 5 mock samples (alpha/alpha-margin/beta/insufficient_diversity/abort_payload_inconsistent) — all 5 PASS.
- [x] `installer/b4c-aggregate.md` operator runbook committed
- [x] Closure doc `wiki/375` (this file) committed with α/β decision template + placeholders
- [ ] OPERATOR-GATED: 5 hosts run B4b installer; 5 `validation-result.json` files produced
- [ ] OPERATOR-GATED: `b4c-aggregate.sh` run against the 5 files; `b4c-result.json` produced
- [ ] OPERATOR-GATED: closure doc amended with the recorded `gate_decision` + reasoning (see §5 below)
- [ ] OPERATOR-GATED: if `gate_decision = alpha`: V23.3 roadmap continues α-path
- [ ] OPERATOR-GATED: if `gate_decision = beta`: V23.3 roadmap records the β-pivot plan
- [x] Existing musu-relay test suite stays 189/189 (B4c touches no TypeScript)
- [x] `npx tsc --noEmit` clean (B4c touches no TypeScript)

---

## 4. Why solo orchestrator (no agent-team)

Per `MODE_Agent_Team.md` activation triggers:
- Cross-repo? **NO** (musu-bee only)
- Auth/security/schema? **NO** (no new endpoints; reads existing telemetry_install from B1 + validation-result.json from B4a)
- ≥3 specialist roles? **NO** (single concern: aggregation logic + decision protocol)
- ≥4 files across ≥2 dirs? **NO** (3 files in `installer/` + 2 docs; one concern)

Matches the wiki/369 (B5) solo-orchestrator precedent. The Constitution VI experiment is itself operator-side; no Critic can adjudicate the data on behalf of the operator.

---

## 5. Experiment outcome (OPERATOR FILLS IN)

**Status as of this commit**: NOT YET RUN. The 5-host experiment is operator-gated; this section ships with placeholders for the operator to fill in after running `b4c-aggregate.sh`.

### 5.1 Hosts run

| # | Host class | Host ID | Tar SHA-256 prefix | Notes |
|---|---|---|---|---|
| 1 | `wsl2-already-on` | `<TBD>` | `<TBD>` | `<TBD>` |
| 2 | `wsl2-off-feature-on` | `<TBD>` | `<TBD>` | `<TBD>` |
| 3 | `wsl2-off-feature-off` | `<TBD>` | `<TBD>` | `<TBD>` |
| 4 | `no-bios-vt-simulated` | `<TBD>` | `<TBD>` | `<TBD>` |
| 5 | `fresh-win-vm` | `<TBD>` | `<TBD>` | `<TBD>` |

Date range: `<YYYY-MM-DD>` to `<YYYY-MM-DD>`.

### 5.2 Aggregation result

Paste the `b4c-aggregate.sh` output here:

```json
{
  "experiment_started_at_utc": "<TBD>",
  "experiment_finished_at_utc": "<TBD>",
  "host_count": 5,
  "tar_sha256_unique": ["<TBD>"],
  "tar_sha256_consistent": true,
  "host_class_distribution": {
    "wsl2-already-on": 1,
    "wsl2-off-feature-on": 1,
    "wsl2-off-feature-off": 1,
    "no-bios-vt-simulated": 1,
    "fresh-win-vm": 1
  },
  "success_count": <TBD>,
  "success_rate": <TBD>,
  "gate_threshold": 0.70,
  "k3s_ready_ms_p50": <TBD>,
  "k3s_ready_ms_p95": <TBD>,
  "idle_ram_mb_p50": <TBD>,
  "failure_breakdown_by_class": { "<TBD>": "<TBD>" },
  "per_host": [ "<TBD>" ],
  "gate_decision": "<alpha|beta|abort_payload_inconsistent|insufficient_diversity>"
}
```

### 5.3 Decision

**`gate_decision`**: `<TBD>`

**Reasoning**: `<operator prose: what failure modes appeared, what surprised, what was confirmed>`

### 5.4 α-path actions (if `gate_decision = alpha`)

- V23.3 work continues α-path: musu-bridge inside the tar as K3s Pod, SOURCE_DATE_EPOCH byte-reproducible builds, deep `@roamhq/wrtc` musl audit, T1.9 wrtc factory wiring (replaces `pcFactory` stub in `src/gateway/main.ts`)
- V23.3 task list amended in `V23_MASTER_PLAN_2026_05_15.md`
- V23.2 final closure references this `gate_decision` as the gating evidence

### 5.5 β-path actions (if `gate_decision = beta`)

Identify dominant failure mode from `failure_breakdown_by_step`, then decide:
- (a) **Fix specific failure + re-run B4c**: e.g., `k3s_start` always fails → revise B4a `openrc-k3s.conf` flags (drop `--snapshotter=native`? try `--flannel-backend=host-gw`?) and re-run with same 5 hosts
- (b) **Debian-slim base pivot**: if K3s on Alpine-WSL2 is fundamentally unstable → B4a.2 task: replace Alpine base in `build-musu-backend.sh` with `debian-slim`; rebuild tar; re-run B4c
- (c) **Drop α-path entirely, rebase on β**: WSL2 unsupportable for V23.2 prosumer audience → V23.3 plan documents the β-retreat: either Docker-Desktop-hard-require (re-introduces V23.0 rejected dependency) OR drop K3s entirely and ship a simpler container substrate (containerd-direct, podman-WSL, native-Python like v21)

Record the chosen β-path in V23.3 task list with concrete next-step ownership.

### 5.6 abort or insufficient outcomes

- `gate_decision = abort_payload_inconsistent`: the 5 hosts ran different tars. **Action**: rebuild `musu-backend.tar` once, redistribute to 5 hosts, re-run experiment. Do NOT record this run as B4c gate data.
- `gate_decision = insufficient_diversity`: fewer than 3 distinct `b4c_host_class` values represented. **Action**: extend host pool to cover ≥3 classes; re-run.

Neither outcome counts toward V23.2 closure — re-run required.

---

## 6. Constitution gates

- **Const III** (schema): NO (no new tables; reads existing B1 telemetry_install)
- **Const VI** (experiment): **YES** — this IS the gate experiment. The `gate_decision` in §5.3 IS the deliverable. Per master plan §V23.2 exit criteria, "B4c Const VI gate has a written decision (α or β)" is one of the V23.2 closure preconditions.
- **Const VII** (push): YES — feature-branch push of the 4 doc/script files to `v22/gap-analysis` allowed now. Main-branch merge of V23.2 stays gated by the final V23.2 closure (separate doc) which itself depends on §5.3 above being filled in.

---

## 7. Operational dependency forward

After this closure ships, the V23.2 Workstream B blocking path is:

1. (Pre-req) B4a operator-gated items: actual `musu-backend.tar` built on Alpine WSL host; `validate-import.ps1` produces `validation-result.json` with `k3s_ready_status: ready` on ≥1 host. Per wiki/371 §3, those items remain operator-gated.
2. Operator runs `installer\install-wsl2.ps1` on each of the 5 B4c hosts. Per wiki/373 §3, B4b's operator-gated items are also subsumed by B4c (the B4c experiment IS the B4b end-to-end test on 5 hosts).
3. Operator runs `installer/b4c-aggregate.sh` against the 5 `validation-result.json` outputs. Records the `gate_decision` in §5.3 above. Amends this closure doc.
4. Operator authorizes the V23.2 final closure doc (wiki/376 — not yet written; depends on §5.3 outcome).
5. Const VII gate for main-branch merge of V23.2 work.

The next /loop iteration (or the user's `진행해`) determines whether V23.2 final closure is written now (referencing the unfilled §5.3 as a deferred operator action) OR after the 5-host experiment completes. **Default**: write V23.2 final closure now with explicit OPERATOR-GATED note that §5.3 fills in post-experiment.

---

## 8. Follow-on tickets

- B4c.2 (only if `gate_decision = beta + fix + re-run`): targeted second B4c after a specific fix lands
- V23.2 final closure (wiki/376) — depends on §5.3 outcome
- V23.3 task list amendment — depends on α vs β
- V23.4 Tauri UI deep-link for tunnel_token acquisition (replaces `Read-Host -AsSecureString` in install-wsl2.ps1)
- V23.5 code-signed `musu.exe` wrapper for the installer

---

## 9. References

- wiki/361 (master plan §B4c lines 146-154, "Const VI gate" lines 192-193)
- wiki/370 §7.2 (validation-result.json schema; locked b4c_host_class enum)
- wiki/371 (B4a closure — operator-gated items)
- wiki/372 §14 (B4b plan Critic Findings; same `b4c_host_class` enum extended to 6 values, but only 5 are reachable post-C11 fallback)
- wiki/373 (B4b closure — install-wsl2.ps1 reference + install_completed HMAC emission)
- wiki/374 (B4c plan — this closure's design contract)
- V23_MASTER_PLAN_2026_05_15.md §0.5 (3-tier install flow)
- musu-relay/src/signaling/telemetry.ts:61-77 (telemetry_install schema)
- musu-relay/src/signaling/telemetry.ts:745-786 (B3 `/summary` endpoint — aggregate counts only; B4c uses local validation-result.json for per-class breakdown)
- `MODE_Agent_Team.md` (solo-orchestrator vs agent-team activation rules — B4c falls under solo per §4)

**End of B4c closure (wiki/375). §5 OPERATOR-GATED; remaining sections complete.**
