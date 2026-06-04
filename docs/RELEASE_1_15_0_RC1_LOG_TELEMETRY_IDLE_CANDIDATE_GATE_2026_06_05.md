# MUSU 1.15.0-rc.1 Log/Telemetry Idle Candidate Gate

**Wiki ID**: wiki/718
**Date**: 2026-06-05 KST

## Scope

The idle busy-loop candidate summary now includes the previously missing
`log/telemetry flush loop` suspect.

This keeps the release roadmap aligned with the operator's original CPU-risk
list: polling, clipboard, mDNS, health/readiness, frontend/refetch, bridge/log
telemetry, relay target polling, and heartbeat loops must all be visible in
go/no-go output.

## Change

`audit-rust-background-loop-contract.ps1` now emits:

- `telemetry_flush_primitive_hit_count`
- `telemetry_flush_primitive_hits`
- check `logging-telemetry / no background telemetry flush worker primitives`

The check fails if Rust source introduces common background log/telemetry flush
worker primitives such as OpenTelemetry, tracing appenders, explicit force
flush APIs, or exporter flush workers without first making that loop visible in
the audit contract.

`write-release-go-no-go.ps1` now adds the seventh
`idle_busy_loop_candidate_status` candidate:

- `log/telemetry flush loop`

The candidate is verified by:

- `source / new rust loops must be audited`
- `logging-telemetry / no background telemetry flush worker primitives`

The existing `frontend interval/refetch` candidate continues to cover frontend
telemetry/refetch interval risks through the direct `setInterval` and
visibility-listener source bans.

## Validation

PowerShell parser:

- `write-release-go-no-go.ps1`: passed
- `audit-rust-background-loop-contract.ps1`: passed

Direct audits:

- `audit-rust-background-loop-contract.ps1 -Json`: `ok=true`,
  `fail_count=0`, `unaudited_loop_hit_count=0`,
  `telemetry_flush_primitive_hit_count=0`
- `audit-frontend-polling-contract.ps1 -Json`: `ok=true`, `fail_count=0`,
  `direct_interval_hit_count=0`, `direct_visibility_listener_hit_count=0`

Go/no-go dirty-tree summary after the script change:

- `idle_busy_loop_candidate_contract_verified=true`
- candidate count: `7`
- failed candidates: none
- `frontend_polling_contract_verified=true`
- `rust_background_loop_contract_verified=true`
- `ready_for_public_desktop_release=false`
- `manifest_git.dirty=true`

`manifest_git.dirty=true` is expected before commit because release tooling and
docs changed.

## Remaining Release State

This is source/gate hardening only. It does not change packaged runtime
behavior, replace 60-second CPU evidence, or close the two-machine idle CPU
gate.

Public release remains No-Go on:

- second-PC runtime idle CPU evidence,
- second-PC runtime CPU scenario matrix evidence,
- second-PC multi-device route evidence,
- hosted MUSU.PRO P2P source marker/KV/evidence gaps,
- support mailbox evidence, and
- Store evidence.
