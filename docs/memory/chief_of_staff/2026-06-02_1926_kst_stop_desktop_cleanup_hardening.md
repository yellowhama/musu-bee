# 2026-06-02 19:26 KST - Stop/Desktop Cleanup Hardening

`musu stop` / `musu down` gained an explicit desktop cleanup mode:

- command: `musu down --json --timeout-sec 5 --include-desktop`
- schema remains `musu.stop_report.v1`
- new JSON fields:
  - `include_desktop`
  - `desktop_cleanup_attempted`
  - `desktop_pids_before`
  - `desktop_terminate_requested_pids`
  - `desktop_pids_after`
  - `desktop_errors`
- default `musu down` behavior is unchanged and only stops the registered
  bridge runtime PID
- `scripts\windows\run-second-pc-release-check.ps1` now calls the new option
  before its existing packaged-desktop cleanup fallback

Validation:

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml`
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`
- `cargo test --manifest-path .\musu-rs\Cargo.toml bridge::services --lib -- --test-threads=1`
  passed 15/15
- `cargo test --manifest-path .\musu-rs\Cargo.toml install::cli_commands --lib -- --test-threads=1`
  passed 14/14
- parser check passed for `run-second-pc-release-check.ps1`
- `git diff --check` passed
- source CLI smoke `down --json --timeout-sec 1 --include-desktop` returned
  `ok=true`, `desktop_cleanup_attempted=true`, empty desktop PID lists, and
  no desktop errors

Release meaning:

- This improves process cleanup and second-PC return attribution.
- Because it changes Rust source, packaged current evidence must be refreshed
  after commit before local release gates are source-current again.
- Public release is still No-Go on two-machine CPU/matrix/route, live P2P,
  support mailbox, and Store evidence.
