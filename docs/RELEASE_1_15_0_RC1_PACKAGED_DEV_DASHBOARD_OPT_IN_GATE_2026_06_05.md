# Release 1.15.0-rc.1 Packaged Dev Dashboard Opt-In Gate

Date: 2026-06-05

## Root Cause

`ERR_CONNECTION_REFUSED` at `http://127.0.0.1:3001/app` means the browser reached a local developer dashboard port with no listener. It does not mean MUSU Desktop needs an internet connection, and it does not mean the local runtime bridge is down.

The packaged MUSU runtime is the local executor. `musu.pro` is the remote input, room, rendezvous, path-selection, relay-fallback, and evidence control plane.

## Change

- Packaged MUSU Desktop now disables the developer dashboard surface by default.
- The debug dashboard can be exposed only by explicitly setting `MUSU_DESKTOP_ENABLE_DEV_DASHBOARD=1` or by running a debug build.
- The desktop shell labels the surface as a debug dashboard, not the product runtime.
- Single-machine release evidence now rejects packaged evidence tied to the fixed dev dashboard defaults `127.0.0.1:3000` or `127.0.0.1:3001`.
- Frontend polling audit now includes the Tauri shell JS and fails if it adds interval, timeout, or animation loops.

## Validation

- PowerShell parser checks passed for changed verifier/audit scripts.
- `cargo test` in `musu-bee/src-tauri`: 8 passed.
- `npm run build:tauri-shell`: passed.
- `audit-frontend-polling-contract.ps1 -Json -FailOnProblem`: `ok=true`, `fail_count=0`.
- `test-release-evidence-verifiers.ps1 -Json`: `ok=true`, `case_count=41`, `failed_case_count=0`.
- New negative case `single-machine rejects packaged evidence tied to dev dashboard 3001` passed expectation.
- `audit-desktop-release-readiness.ps1 -Json` passed the new packaged dev dashboard opt-in source contract; the overall audit remains No-Go only because current multi-device evidence is still invalid.
- `git diff --check`: passed.

## Release Impact

This is desktop shell and release-gate source hardening. Fresh packaged MSIX, single-machine, idle CPU, and runtime CPU matrix evidence are required before this source change can be claimed as current packaged release evidence.

Public release remains blocked on second-PC multi-device/CPU/matrix evidence, hosted `musu.pro` P2P proof, support mailbox evidence, and Store evidence.
