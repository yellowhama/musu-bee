# MUSU 1.15.0-rc.1 Stop/Desktop Cleanup Hardening - 2026-06-02

## Summary

`musu stop` / `musu down` now have an explicit desktop cleanup mode:

```powershell
musu down --json --timeout-sec 5 --include-desktop
```

Default behavior remains unchanged: without `--include-desktop`, the command
only stops the registered bridge runtime PID from `~\.musu\services\bridge.json`.

## Product Meaning

The user-facing problem is that "turn MUSU off" must not leave runtime or
desktop shell processes behind after evidence runs, second-PC checks, or manual
cleanup. The prior `musu.stop_report.v1` stopped only the bridge runtime; the
second-PC wrapper had to run a separate PowerShell desktop-shell cleanup path.

This change moves the cleanup contract into the MUSU CLI while keeping it
explicit:

- `--include-desktop` enumerates exact `musu-desktop` / `musu-desktop.exe`
  process names.
- It requests termination through the same bounded PID wait policy as bridge
  cleanup.
- It records the desktop cleanup in the JSON stop report.
- It does not make relay/P2P, second-PC CPU, support-mailbox, or Store evidence
  pass by itself.

## Stop Report Additions

`musu.stop_report.v1` now includes:

- `include_desktop`
- `desktop_cleanup_attempted`
- `desktop_pids_before`
- `desktop_terminate_requested_pids`
- `desktop_pids_after`
- `desktop_errors`

The command reports `ok=false` when desktop cleanup is requested and desktop
processes remain or termination cannot be requested.

## Second-PC Flow

`scripts\windows\run-second-pc-release-check.ps1` now calls:

```powershell
musu down --json --timeout-sec 5 --include-desktop
```

The wrapper still keeps its existing packaged-desktop cleanup fallback after the
CLI call. This gives the return evidence two layers:

- `musu.stop_report.v1` proves the runtime-side cleanup command knew about
  desktop cleanup.
- `musu.second_pc_runtime_cleanup.v1` still records remaining packaged desktop
  shell count and PIDs after the wrapper finishes.

## Validation

Local validation on `HUGH_SECOND`:

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml`
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`
- `cargo test --manifest-path .\musu-rs\Cargo.toml bridge::services --lib -- --test-threads=1`
  passed 15/15.
- `cargo test --manifest-path .\musu-rs\Cargo.toml install::cli_commands --lib -- --test-threads=1`
  passed 14/14.
- PowerShell parser check passed for
  `scripts\windows\run-second-pc-release-check.ps1`.
- `git diff --check` passed.
- CLI smoke:
  `cargo run --manifest-path .\musu-rs\Cargo.toml --bin musu -- down --json --timeout-sec 1 --include-desktop`
  emitted `musu.stop_report.v1` with `ok=true`,
  `desktop_cleanup_attempted=true`, empty desktop PID lists, and
  `desktop_errors=[]` on a no-op cleanup machine.

## Remaining Release Meaning

This is runtime/process hardening, not release evidence completion. Because it
changes Rust source, current packaged MSIX evidence is stale for this source
commit until the MSIX is rebuilt/installed and primary smoke/CPU/matrix/process
evidence are refreshed. Public release remains No-Go until:

- current two-machine runtime idle CPU evidence passes,
- current two-machine runtime CPU scenario matrix evidence passes,
- real release-grade multi-device route evidence passes,
- live `musu.pro` P2P control-plane evidence passes,
- `musu@musu.pro` mailbox evidence passes,
- Partner Center / Microsoft Store evidence passes.
