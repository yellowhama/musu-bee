# MUSU 1.15.0-rc.1 Cloud Hardware Probe Idle Hardening

**Date**: 2026-06-02 21:10 KST  
**Wiki ID**: wiki/567  
**Scope**: logged-in `musu.pro` cloud heartbeat background work, idle CPU risk, and startup/process-spawn hardening.

## Summary

The logged-in cloud registration loop still publishes coarse hardware metadata
to `musu.pro`, but that metadata is no longer gathered as repeated heavy
platform probe work on every heartbeat cycle.

Source changes:

- `musu-rs/src/peer/hardware.rs` now exposes
  `gather_hardware_info_cached()`, backed by a process-local `OnceLock`.
- `musu-rs/src/bridge/mod.rs` uses cached hardware metadata in the low-duty
  cloud registration loop.
- Windows total-memory detection now uses native Win32
  `GlobalMemoryStatusEx` instead of PowerShell/WMIC.
- Windows CPU brand detection now reads the registry with `RegGetValueW`
  instead of spawning PowerShell.
- `nvidia-smi` remains available for GPU VRAM detection, but it is now reached
  through the cached hardware path, so the cloud heartbeat does not re-run it
  every interval.

## Product Meaning

This reduces another idle/background CPU candidate:

- no repeated Windows PowerShell/WMIC process creation from the logged-in
  heartbeat;
- no repeated GPU probe process creation from recurring heartbeat cycles;
- cloud registration still keeps the same heartbeat interval policy:
  `300s` default, `60s` floor, failure backoff, and jitter;
- mDNS, clipboard sync, file sync, and planner remain opt-in or conditional as
  previously documented.

This does **not** close the public release CPU gate by itself. It is source
hardening. Public release still requires current packaged evidence, including
the second-PC CPU/matrix/route gate.

## Validation

Passed:

```powershell
cargo fmt --manifest-path .\musu-rs\Cargo.toml
cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1
cargo test --manifest-path .\musu-rs\Cargo.toml peer::hardware --lib -- --test-threads=1
```

Result:

- `cargo check --bin musu`: pass
- `peer::hardware` tests: 3/3 pass
  - cached hardware info is stable within the process
  - Windows stdout capture works
  - slow Windows probe is killed by timeout

## Release Caveat

This is Rust runtime source. After this commit, current packaged primary
evidence is stale until the MSIX is rebuilt/installed and single-machine,
desktop-open CPU, process ownership, desktop single-instance, and runtime CPU
matrix evidence are refreshed from clean git.

Public release remains No-Go until:

- second-PC runtime idle CPU evidence passes;
- second-PC runtime CPU scenario matrix passes;
- release-grade multi-device route evidence passes;
- live `musu.pro` P2P owner-scoped control-plane evidence passes;
- `musu@musu.pro` mailbox evidence passes;
- Store/Partner Center evidence is recorded.
