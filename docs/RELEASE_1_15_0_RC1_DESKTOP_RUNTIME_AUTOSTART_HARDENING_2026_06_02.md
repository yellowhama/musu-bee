# MUSU 1.15.0-rc.1 Desktop Runtime Autostart Hardening

Recorded on 2026-06-02 KST.

## Product Decision

Desktop activation is now a runtime-start contract. Opening MUSU Desktop should
not leave the operator in a shell-only state where `musu-desktop.exe` is running
but the bridge runtime is absent.

This closes the audit gap found during the post stop/desktop cleanup evidence
refresh, where desktop activation alone did not create
`~\.musu\services\bridge.json` and process ownership only passed after an
explicit packaged `musu up --json`.

## Implementation

`musu-bee\src-tauri\src\lib.rs` now:

- starts a one-shot background `musu-runtime-autostart` thread during Tauri
  setup
- checks whether the registered bridge is healthy before doing any work
- runs `musu up --json` only when the bridge is missing or unhealthy
- preserves the manual `Start Runtime` button by reusing the same command path
- prefers the packaged sibling runtime executable next to `musu-desktop.exe`
  before falling back to PATH

The sibling-executable preference is important on developer machines because
`C:\Users\empty\.cargo\bin\musu.exe` can shadow the installed WindowsApps alias.
The packaged desktop should use the installed package's own `musu.exe`, not an
unrelated developer binary.

## Validation

Local source validation:

- `cargo fmt --manifest-path .\musu-bee\src-tauri\Cargo.toml`
- `cargo test --manifest-path .\musu-bee\src-tauri\Cargo.toml -- --test-threads=1`
  passed 7/7 unit tests
- `git diff --check` passed

New tests cover:

- packaged sibling `musu.exe` is preferred
- PATH fallback remains available when no sibling runtime exists
- stale bridge registry cleanup still makes the bridge unhealthy
- command stdout capture still avoids long-lived output pipes

## Post-Commit Packaged Evidence

The local-sideload MSIX was rebuilt and installed from commit
`47bc8f8dd502e9fa884799ceb57db30778a3831c`. Fresh primary evidence is restored
on `HUGH_SECOND`:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-204104-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-203815-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-203833-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-203858-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-204112-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Process ownership now passes immediately after packaged desktop activation
without manually running `musu up`; the bridge runtime is PID `36620` at
`127.0.0.1:14805` and the executable path is the installed package sibling
`musu.exe`.

## Release Meaning

The desktop autostart gap is closed on the primary Windows package. Public
release remains No-Go until:

- the two-machine CPU/matrix gates pass,
- multi-device route evidence passes,
- live `musu.pro` P2P control-plane proof passes,
- `musu@musu.pro` mailbox proof passes,
- Store evidence passes.
