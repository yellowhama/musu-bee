# CoS Memory: Runtime Stop Command Hardening

Date: 2026-06-02 18:15 KST

Added operator cleanup commands:

- `musu stop`
- `musu down`
- both support `--json`
- JSON schema: `musu.stop_report.v1`

Runtime behavior:

- reads registered bridge PID from `~\.musu\services\bridge.json`
- only terminates the PID if it is a MUSU runtime binary
- refuses live non-MUSU registered PIDs
- removes stale bridge registry records
- waits for PID exit with bounded backoff through `wait_for_pid_exit`

Validation:

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check` passed
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed
- `cargo test --manifest-path .\musu-rs\Cargo.toml install::cli_commands --lib -- --test-threads=1`
  passed 14/14
- `cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed
- temporary `MUSU_HOME=.local-build\stop-smoke` smoke:
  - `up --json --timeout-sec 20`: `ok=true`, `bridge_started=true`, bridge
    PID `37292`
  - `down --json --timeout-sec 5`: `ok=true`, `terminate_attempted=true`,
    `terminate_requested=true`, `registry_deregistered=true`,
    `pid_alive_after=false`
  - second `stop --json`: `ok=true`, no registered local bridge runtime

Release meaning:

- This closes a process ownership cleanup gap exposed during evidence runs.
- It does not close public release gates.
- Because this is Rust CLI/runtime source, current primary MSIX/smoke/CPU/matrix
  evidence is stale again after commit and must be refreshed before current-HEAD
  release claims.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RUNTIME_STOP_COMMAND_HARDENING_2026_06_02.md`
