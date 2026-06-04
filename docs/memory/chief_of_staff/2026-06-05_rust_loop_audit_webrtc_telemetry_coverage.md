# 2026-06-05 Rust Loop Audit WebRTC/Telemetry Coverage

## Change

Commit `cf722a15` strengthened
`scripts/windows/audit-rust-background-loop-contract.ps1`.

New WebRTC checks:

- `rtcp reader request-scoped spawn`
- `rtcp reader awaits inbound packets`
- `rtcp reader exits on read failure`

The audit now proves the RTCP reader loop in `musu-rs/src/io/webrtc.rs` is
created only inside the screen-share request path, awaits
`rtp_sender.read(...).await`, and exits on read close/error.

Telemetry/log flush primitive detection now includes `non_blocking`, in
addition to OpenTelemetry/tracing-appender/force-flush exporter primitives.

## Validation

- Parser: `parser ok`.
- Rust background-loop audit: `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`, `telemetry_flush_primitive_hit_count=0`,
  `check_count=118`, WebRTC checks `7`.
- Dirty go/no-go: `rust_background_loop_contract_verified=true`,
  `idle_busy_loop_candidate_contract_verified=true`, `log/telemetry flush loop`
  verified.
- Clean final handoff after commit: `rust_background_loop_contract_verified=true`,
  runtime idle CPU `1/2 [HUGH_SECOND]`, runtime matrix `1/2 [HUGH_SECOND]`,
  `manifest_git_dirty=false`, blockers unchanged.

## Release State

This is source-contract hardening only. It does not close the 2-machine CPU
gate. Remaining blockers are second-PC multi-device, second-PC idle CPU/matrix,
hosted `musu.pro` P2P proof, support mailbox proof, and Store proof.
