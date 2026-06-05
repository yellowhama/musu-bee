# 1.15.0-rc.1 Post Packaged Dev Dashboard Opt-In Primary Evidence Refresh - 2026-06-05

## Summary

After the packaged dev/debug dashboard opt-in gate, the local-sideload MSIX was rebuilt, reinstalled, and verified on HUGH_SECOND. Fresh one-machine packaged local-runtime evidence is restored for the current source line.

This restores primary-machine evidence only. Public release still requires a second machine for runtime idle CPU and runtime CPU scenario matrix gates.

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
- MSIX package generated and signed
- packaged startup smoke passed
- installed package contract verified
- package installed as `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`

Local caveat:

- PATH still resolves `C:\Users\empty\.cargo\bin\musu.exe` before the WindowsApps alias.
- Packaged checks used explicit WindowsApps alias invocation.

## Runtime Repair

`repair-packaged-local-runtime-state.ps1 -StopRepoOrphanHelpers -FailOnProblem -Json` passed.

- repair evidence: `.local-build\packaged-runtime-repair\musu-packaged-runtime-repair-20260605-141126-HUGH_SECOND.json`
- bridge: `http://127.0.0.1:9422`
- bridge PID: `29052`
- dashboard required: `false`
- dashboard reachable URL: `null`
- after process ownership: pass

## Fresh Evidence

Single-machine:

- `docs\evidence\single-machine\1.15.0-rc.1\20260605-141236-HUGH_SECOND.evidence.json`
- verifier passed with `ok=true`
- `dashboard_required=false`
- `single_machine_surface=local-bridge-only`
- bridge `http://127.0.0.1:9422`
- CLI route checked

Desktop-open idle CPU:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-141514-HUGH_SECOND.desktop-open.evidence.json`
- `git_dirty=false`
- sample duration `60.056s`
- max one-core CPU: MUSU `0`, Node `0`, WebView2 `0.21`
- owned WebView2 processes `6`
- working set `364.67MB`
- hot process count `0`

Runtime CPU scenario matrix:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-141700-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-141700-HUGH_SECOND.verification.json`
- verifier passed with `ok=true`, `fail_count=0`
- scenarios: `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`, `post-route`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_141700`
- route task: `a33319ba-c7f5-400a-a178-eef2a9d94531`
- max one-core CPU: MUSU `0`, Node `0`, WebView2 `0.26`
- max working set `369.76MB`

## Go / No-Go

Clean go/no-go after commit `8102191f`:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `runtime_idle_cpu_valid_machine_count=1/2`
- `runtime_cpu_scenario_matrix_valid_machine_count=1/2`
- `rust_background_loop_contract_verified=true`
- `frontend_polling_contract_verified=true`
- `manifest_git.dirty=false`

Remaining blockers:

- second-PC multi-device route evidence
- second-machine runtime idle CPU evidence
- second-machine runtime CPU scenario matrix evidence
- targeted second-PC post-route CPU attempt evidence
- hosted `musu.pro` P2P control-plane proof
- support mailbox evidence
- Store / Microsoft release evidence
