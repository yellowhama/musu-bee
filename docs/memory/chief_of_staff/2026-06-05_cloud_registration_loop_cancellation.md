# 2026-06-05 Cloud registration loop cancellation

- The logged-in `musu.pro` cloud registration loop in
  `musu-rs/src/bridge/mod.rs` now owns a `CancellationToken`.
- Ctrl-C cancels the token, and the heartbeat sleep now uses `tokio::select!`
  over `cloud_registration_cancel.cancelled()` and
  `tokio::time::sleep(sleep_for)`.
- The existing low-duty defaults remain: `MUSU_CLOUD_HEARTBEAT_INTERVAL_SEC`,
  default `300s`, floor `60s`, failure backoff, and jitter.
- Added pure helper coverage for heartbeat normalization and capped backoff
  sleep duration.
- `audit-rust-background-loop-contract.ps1` now requires cloud heartbeat
  cancellation-token ownership and cancellation-aware sleep.
- Validation passed parser check, `cargo fmt`, targeted Rust tests `2/2`,
  `cargo check --bin musu`, Rust background-loop audit `ok=true`, and
  `git diff --check`.
- Dirty go/no-go kept loop contracts true and one-machine evidence counts at
  idle CPU `1/2` and runtime matrix `1/2`.
- Clean go/no-go after commit kept loop contracts true and
  `local_artifacts_ready=true`, but correctly reset `single_machine_verified`
  to false and CPU/matrix counts to `0/2` because `musu-rs/src/bridge/mod.rs`
  changed after the latest packaged evidence refresh.
- Public release remains No-Go on fresh packaged local evidence, second-PC
  evidence, hosted P2P proof, support mailbox, and Store proof.
