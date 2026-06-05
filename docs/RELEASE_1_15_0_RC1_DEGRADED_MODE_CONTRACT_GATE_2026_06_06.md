# RELEASE 1.15.0-rc.1 - Degraded Mode Contract Gate

Date: 2026-06-06 KST

## Summary

This change makes degraded/fallback truthfulness a first-class release gate.
MUSU Desktop remains the local executor. MUSU.PRO may provide remote input,
project/company rooms, rendezvous, path selection, relay-fallback policy, and
evidence, but API/UI surfaces must not present unavailable local state as
healthy state.

New release audit:

- `scripts\windows\audit-degraded-mode-contract.ps1`
- schema: `musu.degraded_mode_contract.v1`
- go/no-go field: `degraded_mode_contract_verified`
- blocker area: `degraded-mode`

## Product Spec Delta

The local program and web/control surfaces are now explicitly split:

- Local MUSU program owns actual work, bridge health, device status, process
  execution, route attempts, and local resource state.
- MUSU.PRO/web surfaces may accept user input and coordinate connection, but
  must expose stale/unavailable/fallback states as `degraded`, `offline`, or
  explicit fallback source.
- `/api/device-status` now returns a local status envelope with top-level
  `source`, `reason`, `cpu`, `gpu`, `ram`, `device_id`, `recommended_for`,
  `degraded`, `degradedReason`, and `devices`.
- `source=status` means bridge `/status` was read.
- `source=health-fallback` means `/status` failed but `/health` gave a
  structured bridge fallback.
- `source=offline-fallback` means the local bridge status/health path failed;
  the route returns no fabricated recommendations and marks the local device
  offline.
- Device discovery now reads both the new envelope and the older bare device
  array shape.

## What Changed

- Added `audit-degraded-mode-contract.ps1` to verify degraded/fallback state
  exposure across:
  - agents API and route tests
  - device-status API and route tests
  - device discovery UI normalization
  - nodes mesh degraded status
  - Sidebar degraded badge
  - NodesPanel degraded visual state
  - COS synthesis degraded envelope and ProjectBriefing handling
  - `test:routes` coverage
- Wired the audit into:
  - `write-release-go-no-go.ps1`
  - `show-final-release-handoff-status.ps1`
  - `prepare-final-operator-gate-packet.ps1`
  - `verify-final-operator-gate-packet.ps1`
  - `audit-desktop-release-readiness.ps1`
  - release evidence verifier source-contract tests
  - freshness status-only classifier lists
- Expanded `npm run test:routes` to include `agents/route.test.ts` and
  `device-status/route.test.ts`.
- Added test-only `server-only` no-op shims for route tests that import the
  server-only bridge token helper under Node's test runner.

## Code Audit

Medium issue found and fixed:

- `/api/device-status` had drifted from its tests and consumers. The route
  returned only a fleet device array from `/api/fleet/status`, while `@route`
  and existing route tests expected local `/status` metrics, `recommended_for`,
  and explicit fallback sources. The route now calls `/status`, falls back to
  `/health`, emits an explicit offline fallback, and still carries a `devices`
  array for discovery.

Test-infrastructure issue found and fixed:

- `agents` and `device-status` route tests could not be included in
  `test:routes` because importing `bridge-token.ts` pulled in `server-only`,
  which throws in a plain Node test runner. The tests now replace only that
  package with a no-op cache entry before importing the route module.

No high or remaining medium issue was found after validation.

## Validation

Passed:

- PowerShell parser checks for changed release scripts
- `npm run test:routes` - 28/28
- `npm run typecheck`
- `audit-degraded-mode-contract.ps1 -Json` - `ok=true`, `fail_count=0`
- `test-release-evidence-verifiers.ps1 -Json` - `ok=true`, `case_count=51`,
  `failed_case_count=0`
- dirty-tree `write-release-go-no-go.ps1 -SkipPublicMetadata -Json` completed;
  it correctly kept public release No-Go while this work was uncommitted.

## Post-Commit Clean Go/No-Go

After commit `f8c8e4ed3ee23a00a4657e5753ed25954f38bcf8`, clean HEAD
go/no-go with public metadata skipped reported:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `msix_install_verified=true`
- `degraded_mode_contract_verified=true`
- `manifest_dirty=false`
- `single_machine_verified=false`
- `runtime_idle_cpu_valid_machine_count=0/2`
- `runtime_cpu_scenario_matrix_valid_machine_count=0/2`
- `runtime_cpu_second_pc_route_attempt_verified=false`

This is expected: the commit changes Next/API source, so previous current-source
single-machine and CPU/matrix evidence cannot be reused for the new HEAD. The
next primary-machine evidence refresh must run after this commit.

## Qualitative Evaluation

This is a useful product hardening step, not a release-completion step.

Quality rating: 8/10.

Why it is strong:

- It catches a real class of product confusion: the UI or web route showing
  normal-looking state when the local program is down, stale, or only reachable
  through a fallback.
- It aligns with the desktop/web split the operator requested: the local MUSU
  program does the work; web surfaces accept input and coordinate connection.
- It adds both route-level tests and release-level static audit, so future
  regressions can fail in CI or in the final operator packet.

Remaining risk:

- This is mostly contract and regression hardening. It does not prove live
  two-machine P2P behavior, hosted relay payload delivery, or second-PC CPU
  budgets.
- The new device-status envelope is backward compatible for discovery, but any
  undocumented external consumer expecting a bare array should move to
  `response.devices`.

## Release Impact

Public desktop release remains No-Go. Remaining blockers are unchanged:

- real second-PC multi-device route evidence
- second-PC idle CPU evidence
- second-PC runtime CPU scenario matrix evidence
- hosted MUSU.PRO owner-scoped P2P/relay proof
- support mailbox proof
- Partner Center/Store evidence
