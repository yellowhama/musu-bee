# MUSU 1.15.0-rc.1 Current-HEAD Idle CPU And Route-Attempt Evidence

**Date**: 2026-06-07 01:00 KST
**Machine**: `HUGH_SECOND`

## Summary

Current packaged MUSU Desktop was sampled in real `desktop-open` state for 60
seconds. The sample passed the idle CPU gate on the primary machine:
MUSU `0`, Node `0`, owned WebView2 max `0.03` of one logical core, with
runtime `1`, desktop shell `1`, and owned WebView2 helpers `6`.

The runtime CPU scenario matrix was also refreshed with a targeted
`HUGH-MAIN` route attempt. `HUGH-MAIN` timed out, so this is diagnostic route
attempt evidence, not successful two-machine route proof. The post-route CPU
sample stayed quiet and the targeted route-attempt verifier passed after route
probe exit evidence was normalized.

## Code Fix

`measure-musu-runtime-cpu-scenarios.ps1` now separates raw route command exit
code from effective route probe exit code:

- successful route probe: exit `0` plus expected token in output
- failed route diagnostic: non-zero effective exit code
- raw CLI exit is preserved as `raw_exit_code`

This prevents a timeout that writes an error to stderr but exits `0` from
being recorded as a fake successful/failed route diagnostic. The release
verifier source contract now requires this normalization.

## Desktop-Open Idle CPU Evidence

Evidence:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-003914-HUGH_SECOND.desktop-open.evidence.json`

Result:

- `ok=true`
- `git_commit=169c0bd4f3f3425d318e07806fd31a9e0f20845b`
- `git_dirty=false`
- `sample_seconds=60.031`
- `hot_process_count=0`
- max one-core CPU by role:
  - MUSU: `0`
  - Node: `0`
  - owned WebView2: `0.03`
- max one-core CPU by subrole:
  - bridge runtime: `0`
  - desktop shell: `0`
  - WebView2 helper: `0.03`
- process counts:
  - bridge/runtime: `1`
  - desktop shell: `1`
  - owned WebView2 helpers: `6`
- working set after sample: `358.08 MB`

## Runtime CPU Matrix And Route Attempt

Matrix:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-005241-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Verification:

- target route attempt:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-005241-HUGH_SECOND.target-route.verification.json`
  - `ok=true`
  - `fail_count=0`
- full matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-005241-HUGH_SECOND.verification.json`
  - `ok=false`
  - `fail_count=1`
  - reason: post-route probe did not receive the expected route token

Matrix result:

- `ok=true` for CPU/resource budget measurements
- `git_commit=8fc9cc2d9b47ad4cb29b9ec059c6af02adab66e7`
- `git_dirty=false`
- all five scenarios sampled for `60s`
- route target: `HUGH-MAIN`
- route probe: `ok=false`
- effective route exit code: `1`
- raw route CLI exit code: `0`
- route output: TCP/HTTP request to `192.168.1.192:8949` timed out
- max one-core CPU across matrix:
  - MUSU: `0`
  - Node: `0`
  - owned WebView2: `0.1`
  - bridge runtime: `0`
  - desktop shell: `0`

## Go/No-Go Impact

Dirty-tree go/no-go after the evidence refresh reported:

- `ready=false`
- `dirty=true`
- `blocker_count=7`
- blockers:
  `multi-device`, `runtime-idle-cpu`, `runtime-cpu-scenario-matrix`,
  `support-mailbox`, `store-release`, `p2p-control-plane`, `git`
- `runtime_idle_cpu_verified=false`
- runtime idle valid machines: `1`
- `runtime_cpu_scenario_matrix_verified=false`
- runtime matrix valid machines: `1`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- targeted route-attempt valid machines: `1`

After commit, the temporary `git` blocker should drop. Public release remains
No-Go on six gates: multi-device, two-machine idle CPU, full runtime CPU
matrix, hosted MUSU.PRO P2P/relay proof, support mailbox, and Store evidence.

## Qualitative Audit

No high or medium issue was found.

The current installed desktop does not show the reported 20% busy-loop in
desktop-open, startup-open, runtime-started, dashboard-open, or post-route
diagnostic states on `HUGH_SECOND`. The highest owned WebView2 CPU observed
was `0.1` of one logical core. This is strong primary-machine evidence, but
it is still not two-machine release proof.

## Product Boundary

MUSU Desktop remains the local executor. MUSU.PRO remains remote input,
project/company room, rendezvous, path-selection, relay policy, and
evidence/control plane. This evidence proves local CPU/resource behavior on
one installed Windows device; it does not prove hosted relay transport or a
successful second-PC route.
