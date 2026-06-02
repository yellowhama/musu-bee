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

## Release Meaning

This is Tauri desktop source. Existing MSIX/runtime evidence is stale until the
local-sideload MSIX is rebuilt, installed, and retested. Required follow-up
evidence:

- packaged desktop single-instance audit should now leave both desktop shell and
  bridge runtime running after desktop activation
- process ownership should pass without manually running `musu up` first
- desktop-open CPU and runtime CPU matrix must be refreshed from clean git state

Public release remains No-Go until the two-machine CPU/matrix gates,
multi-device route evidence, live `musu.pro` P2P control-plane proof,
`musu@musu.pro` mailbox proof, and Store evidence all pass.
