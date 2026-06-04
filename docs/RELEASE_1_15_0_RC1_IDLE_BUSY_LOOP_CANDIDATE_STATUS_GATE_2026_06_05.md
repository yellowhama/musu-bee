# MUSU 1.15.0-rc.1 Idle Busy-Loop Candidate Status Gate

**Wiki ID**: wiki/717
**Date**: 2026-06-05 KST

## Scope

`write-release-go-no-go.ps1` now emits an explicit idle busy-loop candidate
summary instead of only exposing the lower-level frontend and Rust loop audits.

## Change

Added:

- `idle_busy_loop_candidate_contract_verified`
- `idle_busy_loop_candidate_status`
- blocker area `idle-busy-loop-candidates`

The candidate summary checks:

- clipboard polling
- mDNS discovery
- health/readiness retry loops
- frontend interval/refetch polling
- relay payload target polling
- cloud heartbeat

Each candidate maps back to specific audit checks from:

- `musu.frontend_polling_contract.v1`
- `musu.rust_background_loop_contract.v1`

This does not replace 60-second CPU evidence. It makes the causal-candidate
contract visible in the release go/no-go output, while runtime CPU evidence still
proves actual process behavior on machines.

## Validation

PowerShell parser:

- `write-release-go-no-go.ps1`: passed

Whitespace:

- `git diff --check`: passed

Direct audits:

- `audit-rust-background-loop-contract.ps1 -Json`: `ok=true`,
  `fail_count=0`, `unaudited_loop_hit_count=0`
- `audit-frontend-polling-contract.ps1 -Json`: `ok=true`, `fail_count=0`,
  `direct_interval_hit_count=0`, `direct_visibility_listener_hit_count=0`

Go/no-go dirty-tree summary after the script change:

- `idle_busy_loop_candidate_contract_verified=true`
- candidate count: `6`
- failed candidates: none
- `frontend_polling_contract_verified=true`
- `rust_background_loop_contract_verified=true`
- `ready_for_public_desktop_release=false`
- `manifest_git.dirty=true`

`manifest_git.dirty=true` is expected before commit because the release script
itself changed. This is status/gate source only and does not change the packaged
runtime or web app behavior.

## Remaining Release State

The current idle-loop candidate contract is verified on source, and current
primary-machine CPU evidence remains one-machine only. Public release still
requires:

- second-PC runtime idle CPU evidence,
- second-PC runtime CPU scenario matrix evidence,
- second-PC multi-device route evidence,
- hosted MUSU.PRO P2P relay transport proof,
- support mailbox evidence, and
- Store evidence.
