# MUSU 1.15.0-rc.1 Post Stored-Lease Gate Primary Evidence Refresh

Date: 2026-06-03 12:17 KST

## Scope

This pass restored primary-machine release evidence after commit
`ec9db1d29fa350f256ddc6fc9ae8e54ebb2435e5` added the owner-scoped stored relay
lease requirement for relay route evidence.

The refresh covered:

- rebuild and reinstall the current local-sideload MSIX
- run packaged single-machine smoke through the explicit WindowsApps alias
- capture a 60s `desktop-open` idle CPU sample with MUSU, Node, and WebView2
  separated
- capture the five-state runtime CPU matrix:
  `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`,
  `post-route`

## MSIX Build And Install

Command:

```powershell
scripts\windows\run-msix-workflow.ps1 -Configuration release -StartupContract local-sideload-manual -AttemptInstall -VerifyInstalled -ReplaceExisting
```

Result:

- Rust release runtime build passed
- Tauri desktop shell build passed
- MSIX packaging passed for
  `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- packaged startup smoke passed
- installed package contract matched the artifact
- packaged runtime identity reported `distribution=store-msix`

Known local caveat remains unchanged: PATH resolves
`C:\Users\empty\.cargo\bin\musu.exe` before the WindowsApps alias, so runtime
evidence used the explicit packaged alias:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe"
```

## Evidence

Single-machine smoke:

- `docs\evidence\single-machine\1.15.0-rc.1\20260603-120751-HUGH_SECOND.evidence.json`
- verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-120751-HUGH_SECOND.verification.json`
- summary:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-120751-HUGH_SECOND.summary.md`
- dashboard task:
  `afb7e08d-427b-4307-bdd5-4d5b165dd026`
- output:
  `MUSU_RELEASE_SMOKE_OK_20260603_120729`

Desktop-open idle CPU:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-120903-HUGH_SECOND.desktop-open.evidence.json`
- captured from clean git state at commit
  `ec9db1d29fa350f256ddc6fc9ae8e54ebb2435e5`
- sample duration: `60.054s`
- MUSU CPU: `0`
- repo Node CPU: `0.05`
- owned WebView2 CPU: `0.08`
- hot process count: `0`
- process counts: MUSU `2`, Node `1`, WebView2 `6`
- working set after sample: `496.49MB`

Runtime CPU scenario matrix:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-121028-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- captured from clean git state at commit
  `ec9db1d29fa350f256ddc6fc9ae8e54ebb2435e5`
- route token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_121028`
- verifier: `ok=true`, `fail_count=0`

Matrix summary:

| Scenario | MUSU | Node | WebView2 | Hot | Working set |
| --- | ---: | ---: | ---: | ---: | ---: |
| startup-open | 0 | 0.03 | 0.18 | 0 | 498.99MB |
| runtime-started | 0 | 0.05 | 0.13 | 0 | 499.03MB |
| dashboard-open | 0.03 | 0 | 0.36 | 0 | 500.91MB |
| desktop-open | 0 | 0 | 0.34 | 0 | 500.92MB |
| post-route | 0 | 0 | 0.05 | 0 | 499.29MB |

## Validation

- `verify-single-machine-evidence.ps1`: `ok=true`, `fail_count=0`
- `verify-runtime-cpu-scenario-matrix.ps1`: `ok=true`, `fail_count=0`
- idle CPU JSON: `ok=true`, `git_dirty=false`, `hot_process_count=0`

## Release Interpretation

This restores current primary-machine smoke, idle CPU, and five-state CPU matrix
evidence for the stored relay lease gate commit. Public release remains No-Go
until second-PC runtime evidence, hosted P2P relay payload proof, support
mailbox evidence, and Store evidence are complete.
