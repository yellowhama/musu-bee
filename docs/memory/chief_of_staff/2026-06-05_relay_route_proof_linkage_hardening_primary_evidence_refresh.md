# 2026-06-05 Relay Route Proof Linkage Hardening and Primary Evidence Refresh

## What Changed

- Commit `9d1d9666` binds release-grade relay transport proof to the fallback
  `lease_id` and route `session_id` before returning stored relay route evidence.
- The route-evidence regression now includes stale release-grade relay records
  with mismatched lease/session proof.
- `audit-p2p-store-forward-relay-contract.ps1` now checks
  `release-grade query binds relay transport proof to fallback lease`.

## Validation

- `npm run test:p2p` passed `79/79`.
- `npm run typecheck` passed.
- `audit-p2p-store-forward-relay-contract.ps1 -FailOnProblem -Json` passed
  with `ok=true` and `fail_count=0`.
- `git diff --check` passed before code/evidence commits.

## Fresh Evidence

- MSIX:
  `docs/evidence/msix-install/1.15.0-rc.1/20260605-072911-HUGH_SECOND.evidence.json`
- single-machine:
  `docs/evidence/single-machine/1.15.0-rc.1/20260605-073044-HUGH_SECOND.evidence.json`
- idle CPU:
  `docs/evidence/runtime-idle-cpu/1.15.0-rc.1/20260605-074243-HUGH_SECOND.desktop-open.evidence.json`
- runtime matrix:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.1/20260605-074400-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- matrix verification:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.1/20260605-074400-HUGH_SECOND.verification.json`

The single-machine smoke is bridge-only packaged runtime evidence with
`dashboard_required=false`, `single_machine_surface=local-bridge-only`, and
bridge `http://127.0.0.1:8186`. Idle CPU passed clean git for `60.061s` with
MUSU `0`, Node `0`, WebView2 `0.03`, working set `368.98MB`, and hot `0`.
The matrix passed verifier `ok=true`/`fail_count=0`, route token
`MUSU_CPU_SCENARIO_ROUTE_OK_20260605_074400`, max MUSU `0.03`, Node `0`,
WebView2 `0.16`, and `dashboard-open` did not depend on `localhost:3001`.

## Handoff State

Final handoff after `9b331698`:

- packet/action-pack verified
- local artifacts, single-machine, MSIX, frontend polling, process/startup, and
  P2P store-forward contract gates true
- runtime idle CPU `1/2 [HUGH_SECOND]`
- runtime matrix `1/2 [HUGH_SECOND]`
- `manifest_git_dirty=false`
- `ready_for_public_desktop_release=false`

## Remaining Blockers

- second-PC current-build multi-device evidence
- second-PC idle CPU and CPU matrix evidence
- hosted `musu.pro` KV/Upstash and release-grade relay transport proof
- owner-scoped release relay route evidence and payload delivery proof
- `musu@musu.pro` support mailbox proof
- Store/Partner Center proof

Product boundary: the installed local MUSU app executes work. `musu.pro` is the
remote input, project/company room, rendezvous, path-selection, relay fallback,
and evidence control plane. `localhost:3001/app` is optional workspace dashboard
surface only.
