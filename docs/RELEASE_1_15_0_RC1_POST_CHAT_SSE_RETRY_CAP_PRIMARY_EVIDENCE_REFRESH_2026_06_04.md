# MUSU 1.15.0-rc.1 Post Chat SSE Retry Cap Primary Evidence Refresh - 2026-06-04

## Scope

This records the fresh primary-machine evidence after chat SSE retry-cap
hardening and roadmap documentation.

Code/doc context:

- chat SSE retry cap commit:
  `e92e0e558d2336237b7eca70d59c8ce35f764229`
- roadmap documentation commit:
  `96b44841838a048f83c1e388d0e498b18eb89351`
- current clean evidence HEAD:
  `d2c29ef95c07e0a1d299289abe3f95358f4424dd`

## Evidence

MSIX install:

- `docs\evidence\msix-install\1.15.0-rc.1\20260604-121733-HUGH_SECOND.evidence.json`
- verification:
  `docs\evidence\msix-install\1.15.0-rc.1\20260604-121733-HUGH_SECOND.verification.json`
- summary:
  `docs\evidence\msix-install\1.15.0-rc.1\20260604-121733-HUGH_SECOND.summary.md`
- strict alias evidence passed with first alias
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`

Single-machine smoke:

- `docs\evidence\single-machine\1.15.0-rc.1\20260604-122357-HUGH_SECOND.evidence.json`
- dashboard `http://127.0.0.1:3001`
- bridge `http://127.0.0.1:8573`
- dashboard task `06a935cf-31d1-46fb-ae42-70eb2b0f4578`
- dashboard output `MUSU_RELEASE_SMOKE_OK_20260604_122333`
- CLI route output contained `MUSU_CLI_ROUTE_OK_20260604_122333`

Desktop-open idle CPU:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-124137-HUGH_SECOND.desktop-open.evidence.json`
- `ok=true`
- `git_dirty=false`
- sample `60.053s`
- MUSU CPU `0`
- Node CPU `0`
- WebView2 CPU `0.1`
- owned WebView2 process count `6`
- hot process count `0`
- working set `476.22MB`

Runtime CPU scenario matrix:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-123317-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verifier `ok=true`, `fail_count=0`
- route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_123317`
- scenarios:
  `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`,
  `post-route`
- max CPU: MUSU `0.1`, Node `0.03`, WebView2 `0.18`
- max working set `478.47MB`
- hot process count `0`

## Corrections During Capture

The first smoke attempt used the script default dashboard base URL
`http://127.0.0.1:3000`, while the packaged runtime had started the dashboard
at `http://127.0.0.1:3001/app`. The smoke was rerun with
`-DashboardBaseUrl http://127.0.0.1:3001` and passed.

The first matrix verification failed because primary evidence files were
untracked during capture, so the matrix recorded `git_dirty=true`. The passing
matrix was captured from a clean worktree after committing the MSIX/smoke/idle
evidence.

The first desktop-open idle CPU evidence was also captured while the tree was
dirty. It was recaptured from clean HEAD and then passed with `git_dirty=false`.

## Release State

Clean go/no-go on
`d2c29ef95c07e0a1d299289abe3f95358f4424dd` reports:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- runtime idle CPU `1/2 [HUGH_SECOND]`
- runtime CPU matrix `1/2 [HUGH_SECOND]`
- `multi_device_verified=false`
- `p2p_control_plane_verified=false`
- `support_mailbox_verified=false`
- `store_release_verified=false`
- `manifest_git.dirty=false`
- blocker count `6`

Public release remains No-Go on second-PC runtime/multi-device evidence, live
owner-scoped `musu.pro` relay proof, support mailbox evidence, and Store
evidence.
