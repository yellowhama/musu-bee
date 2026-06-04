# MUSU 1.15.0-rc.1 Packaged Local Runtime / Web Split Alignment

Date: 2026-06-05

## Decision

The installed MUSU program is the local executor. It must not require a
workspace Next dashboard on `127.0.0.1:3000` or `127.0.0.1:3001` to be
considered healthy.

`musu.pro` is the remote web-input, project-room, company-room, presence,
rendezvous, path-selection, relay-fallback, and evidence control plane. Work is
still executed by local MUSU programs on each device. Web-assisted rendezvous
can bootstrap peer discovery; after that, devices should prefer P2P mesh, with
hosted relay as fallback only.

## Changes

- Packaged `musu up --json` / `musu doctor --json` now treats absent workspace
  dashboards as normal for `store-msix` runtimes:
  - `dashboard.status=ok`
  - `dashboard.required=false`
  - `dashboard.reachable_url=null`
  - no `dev_url` / `start_url` fallback
  - next step points to `MUSU.PRO` remote input or `musu route --wait <task>`
- Developer/direct-download mode still keeps the existing dashboard readiness
  warning and `npm run dev` / `npm start` hint.
- `smoke-single-machine-beta.ps1` now defaults to the WindowsApps packaged
  `musu.exe` alias, rejects debug runtime unless `-AllowDeveloperRuntime` is
  explicitly supplied, and records bridge-only local runtime evidence when the
  package reports `dashboard.required=false`.
- `verify-single-machine-evidence.ps1` now requires packaged WindowsApps runtime
  identity and accepts the new `local-bridge-only` evidence surface.
- Release readiness and verifier regression tests now guard the bridge-only
  packaged runtime contract.

## Validation

- PowerShell parser checks passed for the changed Windows scripts.
- `cargo test -q --bin musu install::cli_commands` passed: 28/28.
- Full `cargo test -q install::cli_commands` reached the same targeted Rust
  tests, then failed only when invoking `--test r6_auto_update` because Windows
  required elevation (`os error 740`).
- `test-release-evidence-verifiers.ps1 -Json` passed with `ok=true`,
  `case_count=32`, and `failed_case_count=0`.
- `git diff --check` passed.
- `run-msix-workflow.ps1 -Configuration release -StartupContract
  local-sideload-manual -AttemptInstall -VerifyInstalled -ReplaceExisting`
  passed: release runtime build, Tauri shell build, MSIX pack/sign, packaged
  startup smoke, install, installed package contract, and packaged runtime
  identity verification.
- Actual packaged `musu up --json` after reinstall returned bridge
  `http://127.0.0.1:3591`, `dashboard.required=false`, no dashboard URL, and
  next step `Local runtime is ready. Use MUSU.PRO remote input or
  \`musu route --wait <task>\` to run work on this device.`

## Status

This fixes the `127.0.0.1:3001` confusion for packaged local runtime health.
Fresh current-commit single-machine, CPU, and matrix evidence must still be
recorded after this source commit. Public release remains No-Go on second-PC
CPU/matrix, multi-device route evidence, hosted P2P release proof, support
mailbox evidence, and Store evidence.
