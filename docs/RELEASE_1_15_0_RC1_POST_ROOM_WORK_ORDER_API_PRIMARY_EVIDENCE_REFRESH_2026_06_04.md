# MUSU 1.15.0-rc.1 Post Room Work-Order API Primary Evidence Refresh

Date: 2026-06-04 18:02 KST

## Summary

Fresh primary-machine evidence was restored after adding the MUSU.PRO room
work-order API.

The room API source change is:

- `POST /api/rooms/[roomId]/work-orders`
- `origin=musu.pro`
- `channel=company-room`
- `sender_id=musu.pro-room`
- local bridge forward target: `/api/tasks/delegate`

This keeps the product boundary intact: `musu.pro` accepts room/user input and
the installed local MUSU program executes the work.

## Packaging And Install

Rebuilt the local-sideload MSIX for the current source and installed it:

- package: `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- installed package: `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- startup contract: `local-sideload-manual`
- explicit packaged alias:
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`

`install-and-verify-msix.ps1` passed. HUGH_SECOND currently has a developer
alias shadow from `C:\Users\empty\.cargo\bin\musu.exe`, so the fresh
warning-mode install capture was kept diagnostic-only under `.local-build`.
Canonical `docs\evidence\msix-install\1.15.0-rc.1` remains strict release
evidence only.

## Fresh Evidence

Single-machine smoke:

- evidence:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-175043-HUGH_SECOND.evidence.json`
- dashboard: `http://127.0.0.1:3001`
- dashboard source: `musu up.dashboard.reachable_url`
- bridge: `http://127.0.0.1:2001`
- task: `ece8235e-e06b-4b45-9754-d3d79f5b0d05`
- output: `MUSU_RELEASE_SMOKE_OK_20260604_175010`
- CLI route checked: `true`

Desktop-open CPU:

- evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-175223-HUGH_SECOND.desktop-open.evidence.json`
- sample: `60.052s`
- `git_dirty=false`
- max one-core CPU: MUSU `0.03`, Node `0.05`, WebView2 `0.6`
- owned processes: MUSU `2`, Node `1`, WebView2 `6`
- total working set: `480.89MB`
- hot process count: `0`

Runtime CPU scenario matrix:

- evidence:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-175413-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verifier: `ok=true`, `fail_count=0`
- scenarios: `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`, `post-route`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_175413`
- route task: `9bf84cf8-b849-4b79-bd29-e175056385b4`
- max matrix CPU: MUSU `0.31`, Node `0.05`, WebView2 `0.47`
- max matrix working set: `483.12MB`
- hot process count: `0` in all scenarios

## Go/No-Go

Clean go/no-go on commit `b3776f0cb526e35f725d98b777d32c0f7e6c4176`
reported:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `msix_desktop_entrypoint_verified=true`
- `runtime_idle_cpu_valid_machines=["HUGH_SECOND"]`
- `runtime_cpu_scenario_matrix_valid_machines=["HUGH_SECOND"]`
- `multi_device_verified=false`
- `p2p_control_plane_verified=false`
- `public_metadata_ok=true`
- `manifest_git.dirty=false`
- `blocker_count=6`

## Remaining Blockers

Public desktop release remains No-Go until these are recorded:

- successful second-PC multi-device route evidence
- second-PC `desktop-open` runtime idle CPU evidence
- second-PC five-state runtime CPU scenario matrix evidence
- hosted `musu.pro` P2P control-plane proof with release-grade relay/connect
  endpoint evidence
- `musu@musu.pro` support mailbox proof
- Partner Center / Microsoft Store release evidence

## Interpretation

The current one-machine local program path is healthy again after the
MUSU.PRO room work-order API. This does not prove remote-device execution yet:
the same current package still needs to be installed and tested on a second
Windows PC before multi-device/P2P claims can be closed.
