# CoS Memory: Crash-Recovery Contract Gate

Date: 2026-06-06

## Durable Facts

- `musu up` now removes a dead bridge service registry record before probing
  bridge health.
- `UpReport` now exposes `stale_bridge_registry_removed` and
  `stale_bridge_registry_pid`.
- New release audit: `scripts/windows/audit-musu-crash-recovery-contract.ps1`
  with schema `musu.crash_recovery_contract.v1`.
- Go/no-go now reports `crash_recovery_contract_verified` and blocks on
  `crash-recovery` if the contract fails.
- Final handoff status, final operator packet generation/verification,
  release verifier regressions, evidence freshness classifiers, and desktop
  readiness inventory all know about the new gate.

## Validation

- PowerShell parser check: pass
- `cargo fmt --check`: pass
- `cargo check --bin musu`: pass
- `cargo test --lib cleanup_stale_removes_dead_pids`: pass, `1/1`
- crash-recovery audit: `ok=true`, `fail_count=0`
- release verifier regressions: `ok=true`, `case_count=69`,
  `failed_case_count=0`
- desktop release readiness: local artifacts, MSIX desktop entrypoint, desktop
  shell, and single-machine evidence pass; public readiness remains false on
  multi-device evidence
- `git diff --check`: pass

## Interpretation

This is local runtime hardening. It reduces stale-registry recovery risk after
crash or forced stop, but it does not close public release blockers.

MUSU Desktop remains the local executor. MUSU.PRO remains remote input,
project/company room, AI meeting room, presence, rendezvous, path selection,
relay fallback coordination, and evidence/control plane.
