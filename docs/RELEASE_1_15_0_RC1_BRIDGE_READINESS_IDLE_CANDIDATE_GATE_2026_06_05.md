# Release 1.15.0-rc.1 Bridge Readiness Idle Candidate Gate

Date: 2026-06-05T04:10+09:00

## Decision

The idle busy-loop candidate summary now separates `bridge readiness wait loop`
from the broader health check retry loop.

This aligns the release gate with the explicit CPU suspect list:

- health check retry loop
- bridge readiness wait loop

Previously both were grouped as `health/readiness retry`.

## Gate Change

`write-release-go-no-go.ps1` now reports eight
`idle_busy_loop_candidate_status` entries:

- clipboard polling
- mDNS discovery
- health check retry loop
- bridge readiness wait loop
- frontend interval/refetch
- relay payload target poller
- cloud heartbeat
- log/telemetry flush loop

The `health check retry loop` candidate maps to auto-update health polling
checks in `audit-rust-background-loop-contract.ps1`:

- `auto-update / health poll initial backoff`
- `auto-update / health poll max backoff`
- `auto-update / health poll sleep`

The new `bridge readiness wait loop` candidate maps to CLI bridge readiness
checks in `audit-rust-background-loop-contract.ps1`:

- `cli-bridge-health / bridge health poll initial backoff`
- `cli-bridge-health / bridge health poll max backoff`
- `cli-bridge-health / bridge readiness deadline`
- `cli-bridge-health / bridge readiness backoff sleep`

## Validation

Passed:

- PowerShell parser for `write-release-go-no-go.ps1`
- Rust background-loop audit:
  - `ok=true`
  - `fail_count=0`
  - `unaudited_loop_hit_count=0`
- Dirty-tree go/no-go summary:
  - `idle_busy_loop_candidate_contract_verified=true`
  - `candidate_count=8`
  - candidates include `health check retry loop`
  - candidates include `bridge readiness wait loop`
  - no failed idle candidates

## Release Implication

This is source/gate hardening only. It does not replace 60-second CPU evidence,
does not change runtime behavior, and does not close the two-machine idle CPU
gate.

Public release remains No-Go until:

- 60-second idle CPU and runtime matrix evidence pass on two machines,
- second-PC route evidence is recorded,
- hosted P2P control-plane evidence passes,
- support mailbox evidence is recorded, and
- Store evidence is recorded.
