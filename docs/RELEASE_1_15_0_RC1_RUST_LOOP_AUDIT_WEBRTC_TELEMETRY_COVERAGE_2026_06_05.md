# MUSU 1.15.0-rc.1 Rust Loop Audit WebRTC/Telemetry Coverage

Date: 2026-06-05

## Decision

Idle busy-loop hardening remains a release blocker until two machines pass the
60-second CPU gates. This change does not replace CPU evidence; it strengthens
the source contract that explains why known background/request loops are not
allowed to spin.

## Change

Commit `cf722a15117900d1604af4fdbdadadbb7912b5be` expands
`scripts/windows/audit-rust-background-loop-contract.ps1`.

New WebRTC checks:

- `rtcp reader request-scoped spawn`
- `rtcp reader awaits inbound packets`
- `rtcp reader exits on read failure`

These prove the RTCP reader loop in `musu-rs/src/io/webrtc.rs` is created only
inside the explicit screen-share request path, waits on
`rtp_sender.read(...).await`, and exits when the RTCP stream closes or errors.

The telemetry/log flush primitive scanner now also rejects `non_blocking`, so a
future `tracing_appender::non_blocking`-style background log flush worker cannot
silently enter release code without failing the Rust background-loop contract.

## Validation

PowerShell parser:

- `audit-rust-background-loop-contract.ps1`: `parser ok`

Rust background-loop audit:

- `ok=true`
- `fail_count=0`
- `unaudited_loop_hit_count=0`
- `telemetry_flush_primitive_hit_count=0`
- `check_count=118`
- `webrtc-screen-share` check count: `7`

Dirty-tree go/no-go before commit showed:

- `rust_background_loop_contract_verified=true`
- `idle_busy_loop_candidate_contract_verified=true`
- `log/telemetry flush loop` candidate verified
- only expected release blockers plus `git`

Clean final handoff after commit:

- `rust_background_loop_contract_verified=true`
- runtime idle CPU: `1/2 [HUGH_SECOND]`
- runtime CPU matrix: `1/2 [HUGH_SECOND]`
- `manifest_git_dirty=false`
- `ready_for_public_desktop_release=false`
- blockers: `multi-device`, `runtime-idle-cpu`,
  `runtime-cpu-scenario-matrix`, `support-mailbox`, `store-release`,
  `p2p-control-plane`

## Release Meaning

This closes a source-contract coverage gap for a request-scoped network/media
loop and broadens the log/telemetry flush-loop detector. It is not a second-PC
substitute and does not close the two-machine CPU gate.

The active release state remains:

- installed local MUSU program is the executor
- `localhost:3001/app` is optional workspace dashboard only
- `musu.pro` is the remote input, project/company room, rendezvous,
  path-selection, relay-fallback policy, and evidence control plane
- public release remains No-Go until second-PC evidence, hosted P2P proof,
  support mailbox proof, and Store proof are recorded
