# MUSU 1.15.0-rc.1 post proof-binding primary evidence refresh

Date: 2026-06-03 23:01 KST

## Summary

After relay transport proof binding hardening, the local-sideload MSIX was
rebuilt, reinstalled, and primary-machine packaged evidence was refreshed on
`HUGH_SECOND`.

This restores current-source primary evidence after commit
`0051ab54b02c3591c993732bcfa73abef25a763a` and follow-up evidence commits.
It does not close public release because second-PC runtime/multi-device
evidence, hosted relay payload proof, support mailbox evidence, and Store
evidence remain missing.

## Package

- Package: `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- Installed package: `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- Startup contract: `local-sideload-manual`
- Signing certificate thumbprint: `9048EA2A9C0891A574C62F9DF2C1D0DA873952DE`

## Evidence

- Single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-225154-HUGH_SECOND.evidence.json`
- Single-machine verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-225154-HUGH_SECOND.verification.json`
- Desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-225332-HUGH_SECOND.desktop-open.evidence.json`
- Runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-225507-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- Runtime CPU matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-225507-HUGH_SECOND.verification.json`

## Results

- Single-machine smoke passed with dashboard output
  `MUSU_RELEASE_SMOKE_OK_20260603_225125`.
- Dashboard URL: `http://127.0.0.1:3001`.
- Bridge URL: `http://127.0.0.1:1037`.
- Dashboard task: `44f5030f-41e9-47d8-af0f-2419a942fafa`.
- Desktop-open CPU passed for `60.039s`.
- Desktop-open max one-core CPU: MUSU `0.03`, Node `0.03`, WebView2 `0.6`.
- Desktop-open working set: `455.37MB`.
- Runtime matrix verifier passed with `ok=true`, `fail_count=0`.
- Runtime matrix route token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_225507`.
- Runtime matrix max one-core CPU: MUSU `0.44`, Node `0.13`,
  WebView2 `0.44`.
- Runtime matrix max working set: `460.51MB`.

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
- Clean go/no-go on `faef9398e88435adf1339d911a956f322d3b00e7` reports
  `local_artifacts_ready=true`, `single_machine_verified=true`, runtime idle
  CPU `1/2`, runtime CPU matrix `1/2`, and public No-Go on six remaining
  blockers.

## Release Status

Public release remains No-Go until:

- second-PC runtime idle CPU evidence passes
- second-PC runtime CPU scenario matrix passes
- real second-PC multi-device route evidence passes
- hosted `musu.pro` relay payload proof passes
- `musu@musu.pro` support mailbox evidence is recorded
- Partner Center/Store evidence is recorded
