# MUSU 1.15.0-rc.1 Post Packaged Local Runtime / Web Split Primary Evidence Refresh

**Wiki ID**: wiki/728
Date: 2026-06-05

## Decision Lock

`127.0.0.1:3001/app` is not the packaged MUSU local program. It is an optional
workspace/developer dashboard. For installed MSIX runtime health, the release
surface is the packaged WindowsApps `musu.exe` bridge plus desktop shell.

The product split remains:

- Local MUSU programs execute work on each device.
- `musu.pro` accepts authenticated remote input, project/company room context,
  presence, rendezvous, path selection, fallback relay policy, and evidence.
- Web-assisted rendezvous can bootstrap P2P mesh; relay remains fallback-only.

## Evidence Recorded

- Single-machine smoke:
  `docs/evidence/single-machine/1.15.0-rc.1/20260605-060842-HUGH_SECOND.evidence.json`
  verified `ok=true` with WindowsApps
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`,
  `dashboard_required=false`, `dashboard_base_url_source=bridge-only-packaged-runtime`,
  `single_machine_surface=local-bridge-only`, bridge `http://127.0.0.1:3591`,
  and CLI route checked.
- Desktop-open idle CPU:
  `docs/evidence/runtime-idle-cpu/1.15.0-rc.1/20260605-061127-HUGH_SECOND.desktop-open.evidence.json`
  passed for `60.054s` on clean commit `11a26c0b` with MUSU process count `2`,
  Node `0`, owned WebView2 `6`, max one-core CPU MUSU `0`, Node `0`,
  WebView2 `0.6`, total working set `362.17MB`, and hot process count `0`.
- Runtime CPU scenario matrix:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.1/20260605-061306-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  passed with WindowsApps `musu.exe`, `allow_developer_runtime=false`,
  `musu_exe_release_identity=true`, `fail_count=0`, route task
  `75d47304-7992-4741-b85f-27b315e8dbdc`, and token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_061306`.

Runtime matrix max one-core CPU by scenario:

| Scenario | MUSU | Node | WebView2 | Working set | Hot |
|---|---:|---:|---:|---:|---:|
| startup-open | 0.03 | 0 | 0.31 | 362.54MB | 0 |
| runtime-started | 0 | 0 | 0.34 | 364.54MB | 0 |
| dashboard-open | 0 | 0 | 0.05 | 366.44MB | 0 |
| desktop-open | 0 | 0 | 0.1 | 366.19MB | 0 |
| post-route | 0 | 0 | 0.31 | 364.45MB | 0 |

## Process Gates

- `audit-musu-process-ownership.ps1 -FailOnProblem -Json` passed on commit
  `7d3e28ea`: one packaged MUSU runtime, one packaged desktop shell, owned
  Node `0`, owned WebView2 `6`, no repo-related runtime, and bridge health
  `HTTP 200` at `127.0.0.1:3591`.
- `audit-musu-startup-single-instance.ps1 -RepeatCount 3 -FailOnProblem -Json`
  passed on commit `7d3e28ea`: all three `musu up --json` invocations reused
  bridge PID `39052`, no repeated bridge spawn, and embedded process ownership
  audit passed.

## Go / No-Go

Direct go/no-go after the evidence refresh reported:

- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `msix_desktop_entrypoint_verified=true`
- `public_metadata_ok=true`
- `manifest_git.dirty=false`
- `ready_for_public_desktop_release=false`

The remaining public release blockers are unchanged: current-build second-PC
multi-device evidence, second-PC CPU/matrix evidence, hosted `musu.pro` P2P
release tunnel/KV/route/payload proof, support mailbox evidence, and Store
evidence.

