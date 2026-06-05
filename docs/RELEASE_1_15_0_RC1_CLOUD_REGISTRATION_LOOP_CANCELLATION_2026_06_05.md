# MUSU 1.15.0-rc.1 Cloud Registration Loop Cancellation

Date: 2026-06-05

## Summary

The logged-in `musu.pro` cloud registration loop already used a low-duty
heartbeat with failure backoff and jitter. This change makes that loop
cancellation-aware as well, closing a remaining gap in the idle busy-loop
contract: background tasks should have sleep/backoff/cancellation evidence, not
just a long sleep.

## Change

- Added explicit cloud heartbeat helpers in `musu-rs/src/bridge/mod.rs`:
  - `normalize_cloud_heartbeat_interval_sec`
  - `cloud_heartbeat_interval_secs_from_env`
  - `cloud_registration_sleep_duration`
- Added a `CancellationToken` for the cloud registration loop.
- Added a Ctrl-C cancellation path for the loop.
- Replaced the plain `tokio::time::sleep(sleep_for).await` with a
  `tokio::select!` that exits on `cloud_registration_cancel.cancelled()`.
- Extended `audit-rust-background-loop-contract.ps1` so the release contract now
  requires cloud-heartbeat cancellation token ownership and cancellation-aware
  sleep.

## Validation

- PowerShell parser check for `audit-rust-background-loop-contract.ps1`: pass.
- `cargo fmt --manifest-path .\musu-rs\Cargo.toml`: pass.
- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib bridge::tests::cloud -- --nocapture`: pass, `2/2`.
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu`: pass.
- `audit-rust-background-loop-contract.ps1 -Json -FailOnProblem`: pass,
  `ok=true`, `fail_count=0`, `unaudited_loop_hit_count=0`,
  `telemetry_flush_primitive_hit_count=0`.
- `git diff --check`: pass.
- Dirty go/no-go after the source change kept `local_artifacts_ready=true`,
  `single_machine_verified=true`, runtime idle CPU `1/2`, runtime CPU matrix
  `1/2`, `rust_background_loop_contract_verified=true`,
  `idle_busy_loop_candidate_contract_verified=true`, and
  `p2p_store_forward_relay_contract_verified=true`.
- Clean go/no-go after commit kept `local_artifacts_ready=true`,
  `rust_background_loop_contract_verified=true`,
  `idle_busy_loop_candidate_contract_verified=true`, and
  `p2p_store_forward_relay_contract_verified=true`, but correctly reset
  `single_machine_verified=false`, runtime idle CPU `0/2`, and runtime CPU
  matrix `0/2` because `musu-rs/src/bridge/mod.rs` changed after the latest
  packaged evidence refresh.

## Release State

This closes a source-contract gap for the cloud registration background loop. It
does not close the public desktop release, and fresh packaged single-machine,
idle CPU, and runtime CPU matrix evidence is required after this Rust bridge
source change. Remaining blockers are second-PC multi-device evidence,
second-PC idle CPU/runtime matrix evidence, targeted second-PC post-route CPU
attempt, hosted release-grade `musu.pro` P2P control-plane proof, support
mailbox proof, and Store release proof.
