# MUSU 1.15.0-rc.1 Post Relay Status Descriptor Primary Evidence Refresh

Date: 2026-06-03 21:45 KST

## Summary

After commit `16b7373d383751932651c926225aedbf946a9b99`, the local-sideload
MSIX was rebuilt, reinstalled, and primary-machine packaged evidence was
refreshed on `HUGH_SECOND`.

This restores current-source primary evidence after the relay status descriptor
gate changed Rust CLI/source and release scripts. It does not close public
release because second-PC runtime/multi-device evidence, hosted relay payload
proof, support mailbox evidence, and Store evidence remain missing.

## Package

- Package: `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- Installed package: `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- Startup contract: `local-sideload-manual`
- Signing certificate thumbprint: `9048EA2A9C0891A574C62F9DF2C1D0DA873952DE`

## Evidence

- Single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-213326-HUGH_SECOND.evidence.json`
- Single-machine verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-213326-HUGH_SECOND.verification.json`
- Desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-213716-HUGH_SECOND.desktop-open.evidence.json`
- Runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-213849-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- Runtime CPU matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-213849-HUGH_SECOND.verification.json`

## Results

- Single-machine smoke passed with dashboard output
  `MUSU_RELEASE_SMOKE_OK_20260603_213326`.
- Dashboard URL: `http://127.0.0.1:3001`.
- Bridge URL: `http://127.0.0.1:8290`.
- Dashboard task: `87549f6a-dac2-4a75-9453-28b06a6dc58b`.
- Desktop-open CPU passed for `60.05s`.
- Desktop-open max one-core CPU: MUSU `0`, Node `0`, WebView2 `0.21`.
- Desktop-open working set: `511.57MB`.
- Runtime matrix verifier passed with `ok=true`, `fail_count=0`.
- Runtime matrix route token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_213849`.
- Runtime matrix max WebView2 one-core CPU: `0.29`.
- Runtime matrix max working set: `518.07MB`.

## Validation

- `scripts\windows\run-msix-workflow.ps1 -Configuration release -StartupContract local-sideload-manual -AttemptInstall -VerifyInstalled -ReplaceExisting`
  completed successfully.
- `scripts\windows\smoke-single-machine-beta.ps1 -MusuExe "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" -DashboardBaseUrl http://127.0.0.1:3001`
  passed.
- `scripts\windows\measure-musu-idle-cpu.ps1` passed for `desktop-open` with
  clean `git_dirty=false`.
- `scripts\windows\measure-musu-runtime-cpu-scenarios.ps1` passed five states:
  `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`,
  `post-route`, with clean `git_dirty=false`.
- Dirty-tree go/no-go after adding evidence reports `single_machine_verified=true`,
  runtime idle CPU `1/2`, runtime CPU matrix `1/2`, and public No-Go only on
  the expected remaining blockers plus dirty git.

## Release Status

Public release remains No-Go until:

- second-PC runtime idle CPU evidence passes
- second-PC runtime CPU scenario matrix passes
- real second-PC multi-device route evidence passes
- hosted `musu.pro` relay payload proof passes
- `musu@musu.pro` support mailbox evidence is recorded
- Partner Center/Store evidence is recorded
