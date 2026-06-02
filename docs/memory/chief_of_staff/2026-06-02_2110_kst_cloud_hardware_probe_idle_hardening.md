# CoS Memory - Cloud Hardware Probe Idle Hardening

Date: 2026-06-02 21:10 KST

## Decision

Logged-in `musu.pro` cloud heartbeat hardware metadata is now process-cached
and lighter on Windows. The heartbeat still publishes hardware metadata, but it
must not repeatedly spawn platform probes as normal idle background work.

## Changes

- Added `gather_hardware_info_cached()` in `musu-rs/src/peer/hardware.rs`.
- Changed bridge cloud registration metadata to use the cached hardware info.
- Replaced Windows PowerShell/WMIC memory and CPU-brand probes with Win32
  `GlobalMemoryStatusEx` and registry `RegGetValueW`.
- Kept `nvidia-smi` GPU VRAM detection, but only through the cached metadata
  path so recurring heartbeats do not re-run it.

## Validation

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml`
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`
- `cargo test --manifest-path .\musu-rs\Cargo.toml peer::hardware --lib -- --test-threads=1`
  passed 3/3.

## Release State

This reduces an idle/background CPU candidate but does not close release. Rust
runtime source changed, so current packaged primary evidence is stale until a
fresh MSIX build/install and primary evidence refresh. Remaining release
blockers are second-PC CPU/matrix/route, live P2P owner scope, `musu@musu.pro`,
and Store evidence.
