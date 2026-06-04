# MUSU 1.15.0-rc.1 Post Relay Payload Delivery Proof Primary Evidence Refresh

**Wiki ID**: wiki/716
**Date**: 2026-06-05 KST

## Scope

Fresh primary-machine packaged evidence was restored after the relay payload
delivery proof response landed.

## Product Boundary and Roadmap

This refresh preserves the local/web split discussed during the MUSU.PRO
dashboard investigation:

- The installed MUSU program is the local execution plane. It runs on each
  device and performs work with local files, local browser/app control, local
  tools, and local model access.
- `https://musu.pro` is the real user web input and coordination plane. It
  should provide project rooms, company meeting rooms, presence, authenticated
  work orders, rendezvous, path selection, relay fallback coordination, and
  evidence.
- `localhost` / `127.0.0.1` dashboards are local operator surfaces, not the
  product cloud surface.
- Web input does not make MUSU.PRO the runtime executor. A user can submit
  work from another place, but a linked local MUSU program receives the
  authenticated order and does the work locally.
- Device-to-device coordination should use web-assisted rendezvous first, then
  prefer P2P mesh paths: `lan`, `tailscale`, `direct_quic`, then relay only as
  fallback.
- Rooms can coordinate multiple local AI agents attached to the same project,
  but room, rendezvous, route, relay, and work-order state must remain
  owner-scoped.
- Current validation is still one-machine only. Another Windows PC must install
  the same current build before multi-device gates can close.

The source hardening commit was:

- `bd36815a838aa7e5d76426ddf5e09b7da70d9b71`

Follow-up docs/evidence commits are docs-only and do not change the packaged
runtime source:

- `d131fbcfd81a0926c2d46b631ead6a9396d0e7c9`
- `cf3614ce393c056e402e18259833cf4f430dd8b7`
- `e77587c6d2d63e2aa817c03d7e40e4fd1cd206b5`

## MSIX Build and Install

Command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\run-msix-workflow.ps1 -Configuration release -StartupContract local-sideload-manual -AttemptInstall -VerifyInstalled -ReplaceExisting
```

Result:

- Rust release runtime build passed.
- Tauri desktop shell build passed.
- MSIX manifest/assets/pack/sign passed.
- Packaged startup smoke passed.
- Sideload readiness passed.
- Install/reinstall passed.
- Installed package contract passed.
- Packaged runtime identity/local sideload contract passed.
- package:
  `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- installed package: `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`

HUGH_SECOND still reports the known PATH shadowing warning:

- `C:\Users\empty\.cargo\bin\musu.exe`
- packaged WindowsApps alias:
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`

The installed package contract and WindowsApps alias still verify.

## Fresh Evidence

Single-machine smoke:

- `docs\evidence\single-machine\1.15.0-rc.1\20260605-025404-HUGH_SECOND.evidence.json`
- local source evidence:
  `.local-build\single-machine\20260605-025339-HUGH_SECOND.evidence.json`
- dashboard: `http://127.0.0.1:3001`
- bridge: `http://127.0.0.1:13047`
- task id: `ca28ea07-d681-466a-9554-cd985a286dd3`
- output: `MUSU_RELEASE_SMOKE_OK_20260605_025339`
- CLI route checked: `true`
- evidence sha:
  `87110f196a64182e39590b625a51feda794bee553b0708ffcd28dc06d767b7f1`
- verification sha:
  `ab8bf9105ac5033b9bb02be4ad9217afa9f5e36a8b46fe6dc6db31937b9e4879`

Desktop-open idle CPU:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-025501-HUGH_SECOND.desktop-open.evidence.json`
- `ok=true`
- `git_dirty=false`
- sample duration: `60.06s`
- MUSU max CPU: `0%` of one logical core
- Node max CPU: `0%` of one logical core
- WebView2 max CPU: `0.65%` of one logical core
- owned MUSU processes: `2`
- owned Node processes: `1`
- owned WebView2 processes: `6`
- working set: `432.91MB`
- private memory: `375.63MB`
- hot processes: `0`

Runtime CPU scenario matrix:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-025643-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- local source evidence:
  `.local-build\runtime-cpu-scenarios\20260605-025643-HUGH_SECOND\20260605-025643-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `ok=true`
- `git_dirty=false`
- `fail_count=0`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_025643`
- route task id: `8c65316f-8cbe-473c-a0af-a45fb5108193`
- route probe attempt `1` passed
- scenarios: `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`, `post-route`

Scenario summary:

| Scenario | MUSU | Node | WebView2 | Working set | Hot |
|---|---:|---:|---:|---:|---:|
| `startup-open` | `0` | `0` | `0.16` | `435.76MB` | `0` |
| `runtime-started` | `0.03` | `0` | `0.16` | `435.38MB` | `0` |
| `dashboard-open` | `0.18` | `0.86` | `0.03` | `489.36MB` | `0` |
| `desktop-open` | `0.05` | `0.44` | `0.10` | `490.74MB` | `0` |
| `post-route` | `0.08` | `0.34` | `0.13` | `489.22MB` | `0` |

The matrix verifier passed with:

- `ok=true`
- `fail_count=0`
- required scenarios present
- post-route probe successful
- clean git capture
- no resource budget violations

## Go/No-Go

`write-release-go-no-go.ps1 -ScriptTimeoutSeconds 240 -Json` completed at
`2026-06-05T03:07:49+09:00`.

Key result:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `multi_device_verified=false`
- `public_metadata_ok=true`
- `msix_install_verified=true`
- `msix_desktop_entrypoint_verified=true`
- `manifest_git.commit=e77587c6d2d63e2aa817c03d7e40e4fd1cd206b5`
- `manifest_git.dirty=false`

Public release remains No-Go.

## Remaining Blockers

Still open:

- second-PC install/runtime/multi-device evidence,
- two-machine desktop-open idle CPU evidence,
- two-machine runtime CPU scenario matrix evidence,
- hosted MUSU.PRO P2P control-plane proof,
- source relay connect/payload implementation markers,
- hosted KV/Upstash provisioning and live relay evidence,
- release-grade relay connect/payload transport proof,
- support mailbox evidence, and
- Store evidence.

Current source still intentionally reports:

- `RELAY_CONNECT_ENDPOINT_IMPLEMENTED=false`
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- `RELAY_PAYLOAD_QUEUE_ENDPOINT_IMPLEMENTED=true`

The current evidence supports the one-machine local idle CPU/resource-budget
part of the objective. It does not prove the required two-machine release gate.
