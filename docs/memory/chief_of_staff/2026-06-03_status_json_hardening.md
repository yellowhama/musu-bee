# 2026-06-03 Status JSON Hardening

`musu status --json` now works. Commit
`f4ad68cb2a9b4f2e809f0caf4b31e50c4c630884` added `StatusOpts`, wired
`Cmd::Status(StatusOpts)`, and makes `run_status` emit schema
`musu.fleet_status_cli.v1` with `ok`, `bridge_url`, and raw fleet status.

Validation passed:

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check`
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`
- `cargo test --manifest-path .\musu-rs\Cargo.toml install::cli_commands --lib -- --test-threads=1`
  14/14
- `cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`
- `cargo test --manifest-path .\musu-rs\Cargo.toml --bin musu status_cli_accepts_json_flag -- --test-threads=1`
  1/1
- Debug runtime smoke: `up --json`, `status --json`, and `down --json`
  succeeded around bridge `127.0.0.1:6409`.

Because this is Rust source, current packaged primary evidence is stale again
for HEAD. Clean go/no-go after the source commit reports `single_machine=false`,
runtime idle CPU valid machines `0`, runtime matrix valid machines `0`, and
`manifest_dirty=false`.
