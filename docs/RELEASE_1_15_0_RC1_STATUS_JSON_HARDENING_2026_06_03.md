# MUSU 1.15.0-rc.1 Status JSON Hardening

Recorded: 2026-06-03 01:45 KST
Source commit: `f4ad68cb2a9b4f2e809f0caf4b31e50c4c630884`

## Scope

`musu status` now accepts `--json` and emits a machine-readable fleet status
report. This closes a small process/resource hardening gap discovered during
release cleanup: `musu up --json`, `musu down --json`, and `musu doctor --json`
already supported automation, but `musu status --json` failed at argument
parsing.

## What Changed

- Added `StatusOpts { json }` to the Rust CLI.
- Changed `Cmd::Status` to accept those options.
- `run_status(opts)` now prints schema `musu.fleet_status_cli.v1` when
  `--json` is supplied.
- The JSON report includes:
  - `ok`
  - `bridge_url`
  - raw `fleet` data from `/api/fleet/status`
- Human-readable `musu status` output is unchanged.
- Added a binary parser regression test for `musu status --json`.

## Validation

Passed:

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check`
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`
- `cargo test --manifest-path .\musu-rs\Cargo.toml install::cli_commands --lib -- --test-threads=1`
  14/14
- `cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`
- `cargo test --manifest-path .\musu-rs\Cargo.toml --bin musu status_cli_accepts_json_flag -- --test-threads=1`
  1/1
- Runtime smoke with debug binary:
  - `musu up --json --timeout-sec 10` started bridge `127.0.0.1:6409`
  - `musu status --json` returned schema `musu.fleet_status_cli.v1`
  - `musu down --json --timeout-sec 5` stopped bridge PID `35556` and
    deregistered the bridge record

## Product Interpretation

This is release automation hardening, not a new user-facing feature. It makes
fleet/process status machine-readable for scripts, support diagnostics, and
future evidence capture without scraping terminal text.

## Release Caveat

This is Rust source. The previous packaged primary evidence remains useful as
historical proof for source commit `fbd01746`, but it is stale for current HEAD
`f4ad68cb` until the MSIX is rebuilt/reinstalled and primary
single-machine/process/CPU/matrix evidence is refreshed.

Clean go/no-go after the source commit reports:

- `ready=false`
- `local_artifacts_ready=true`
- `single_machine=false`
- runtime idle CPU valid machines `0`
- runtime CPU matrix valid machines `0`
- `manifest_dirty=false`

Public release remains No-Go on fresh current-HEAD primary evidence,
second-PC CPU/matrix/route evidence, live `musu.pro` owner-scoped P2P evidence,
`musu@musu.pro` mailbox evidence, and Store evidence.
