# MUSU 1.15.0-rc.1 Runtime Stop Command Hardening

Date: 2026-06-02

Scope: process ownership and operator cleanup for the local bridge runtime.

## Summary

The packaged CLI previously had `musu up --json` but no matching runtime cleanup
command. During evidence collection, this forced operators to terminate the
bridge process manually after a smoke run. That was a process-ownership gap:
the product could start the runtime, but did not provide a bounded, audited way
to stop the registered local bridge.

This change adds:

- `musu stop`
- `musu down`
- `--json` output for both commands

The command only targets the bridge PID registered in
`~\.musu\services\bridge.json`. It refuses to terminate that PID unless the
process image name is a MUSU runtime executable (`musu`, `musu.exe`, `musud`,
or `musud.exe`). It leaves non-MUSU PIDs untouched and reports the refusal.

## Behavior

`musu down --json` emits schema `musu.stop_report.v1`:

- `ok`
- `home`
- `bridge_addr`
- `bridge_pid`
- `registry_record_present`
- `pid_alive_before`
- `pid_is_musu_runtime`
- `terminate_attempted`
- `terminate_requested`
- `pid_alive_after`
- `registry_deregistered`
- `error`
- `next_steps`

Stop semantics:

- no registry record: `ok=true`, no-op
- stale registry PID: remove stale bridge registry record
- live MUSU runtime PID: request termination, wait with bounded backoff, then
  deregister the bridge record
- live non-MUSU PID: do not terminate, leave registry intact, report error
- PID-less bridge record: do not guess; report that it cannot be stopped safely

The wait path reuses the capped bridge health backoff profile instead of a tight
polling loop.

## Validation

Local validation:

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check` passed
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed
- `cargo test --manifest-path .\musu-rs\Cargo.toml install::cli_commands --lib -- --test-threads=1`
  passed 14/14
- `cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed
- temporary-home CLI smoke passed:
  - `musu up --json --timeout-sec 20`: `ok=true`, `bridge_started=true`,
    bridge PID `37292`
  - `musu down --json --timeout-sec 5`: `ok=true`,
    `terminate_attempted=true`, `terminate_requested=true`,
    `registry_deregistered=true`, `pid_alive_after=false`
  - `musu stop --json` after the first stop returned `ok=true` with no
    registered local bridge runtime

## Release Meaning

This improves hardening and operator cleanup, but it is runtime Rust source.
After this lands, existing primary MSIX/smoke/CPU/matrix evidence from the prior
commit must be treated as stale for current-HEAD release claims until the MSIX
package and primary evidence are refreshed again.

The public release blockers are unchanged:

- second-PC CPU/matrix/route evidence
- live `musu.pro` owner-scoped P2P control-plane evidence
- `musu@musu.pro` mailbox evidence
- Store/Partner Center evidence
