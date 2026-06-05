# 1.15.0-rc.1 Post Desktop Dashboard URL Hardening Primary Evidence Refresh - 2026-06-05

## Summary

After desktop shell dashboard URL hardening, the local-sideload MSIX was rebuilt,
reinstalled, and verified on HUGH_SECOND. Fresh one-machine packaged local
runtime evidence was restored for the current source line.

This restores HUGH_SECOND evidence only. Public release still requires a second
machine for runtime idle CPU and runtime CPU scenario matrix gates.

## Package Refresh

Command:

```powershell
$env:CARGO_BUILD_JOBS='1'
powershell -ExecutionPolicy Bypass -File .\scripts\windows\run-msix-workflow.ps1 `
  -Configuration release `
  -StartupContract local-sideload-manual `
  -AttemptInstall `
  -VerifyInstalled `
  -ReplaceExisting
```

Result:

- release `musu-rs` build completed
- Tauri desktop shell build completed
- MSIX package was generated and signed
- packaged startup smoke passed
- installed package contract verified
- packaged runtime identity for local sideload/manual bridge contract verified

Local caveat:

- PATH still resolves `C:\Users\empty\.cargo\bin\musu.exe` before the
  WindowsApps alias.
- Packaged checks used explicit WindowsApps alias invocation.

## Runtime Repair

`repair-packaged-local-runtime-state.ps1 -StopRepoOrphanHelpers -Json
-FailOnProblem` passed.

- bridge: `http://127.0.0.1:1181`
- bridge PID: `31408`
- dashboard required: `false`
- dashboard reachable URL: `null`
- after process ownership: pass

## Fresh Evidence

Single-machine:

- `docs\evidence\single-machine\1.15.0-rc.1\20260605-112337-HUGH_SECOND.evidence.json`
- verifier passed with `ok=true`, `fail_count=0`
- `dashboard_required=false`
- `single_machine_surface=local-bridge-only`
- bridge `http://127.0.0.1:1181`
- CLI route checked

Desktop-open idle CPU:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-112710-HUGH_SECOND.desktop-open.evidence.json`
- `git_dirty=false`
- `sample_seconds=60.055`
- max one-core CPU: MUSU `0`, Node `0`, WebView2 `0.16`
- working set `363.72MB`
- hot process count `0`

Runtime CPU scenario matrix:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-112906-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-112906-HUGH_SECOND.verification.json`
- verifier passed with `ok=true`, `fail_count=0`
- scenarios: `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`, `post-route`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_112906`
- route task: `37773a7f-6aa3-4f0c-90d7-0317558d044f`
- max one-core CPU: MUSU `0.03`, Node `0`, WebView2 `0.1`
- max working set `366.26MB`

## Release Implication

The current primary machine now has fresh packaged local-runtime smoke, idle
CPU, and runtime CPU matrix evidence after the desktop shell dashboard URL
hardening source change.

Remaining blockers:

- second-PC multi-device route evidence
- second-PC idle CPU evidence
- second-PC runtime CPU scenario matrix evidence
- hosted MUSU.PRO P2P release proof
- support mailbox evidence
- Store/Microsoft evidence
