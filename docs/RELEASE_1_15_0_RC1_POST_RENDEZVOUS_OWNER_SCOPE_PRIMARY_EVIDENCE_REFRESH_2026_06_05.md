# MUSU 1.15.0-rc.1 Post Rendezvous Owner-Scope Primary Evidence Refresh

**Wiki ID**: wiki/714
**Date**: 2026-06-05 KST

## Scope

Fresh primary-machine packaged evidence was restored after rendezvous
owner-scope hardening.

## Product Boundary

This refresh preserves the roadmap decision discussed during the local dashboard
investigation:

- Local dashboards at `localhost` / `127.0.0.1` are local operator surfaces.
- `https://musu.pro` should be the real web input, project room, company
  meeting room, presence, rendezvous, path-selection, relay-fallback
  coordination, and evidence plane.
- The installed MUSU program on each device is the execution plane. It receives
  authenticated web work orders and performs the work locally with local files,
  local browser/app control, and local model/tool access.
- `musu.pro` can help devices meet and exchange route material, then devices
  should prefer P2P mesh paths before relay: `lan`, `tailscale`,
  `direct_quic`, then `relay`.
- Project/company rooms can coordinate multiple local AI agents working on the
  same project, but room/rendezvous/route/relay state must remain owner-scoped.
- Current validation is still one-machine only. Another Windows PC must install
  the same current build before multi-device gates can close.

The source hardening commit was:

- `164072656ad60766cadad267d8aa1c5476618c9d`

Follow-up docs/evidence commits are docs-only and do not change the packaged
runtime source:

- `4eade09604652e498b0ad0e667a161ff4507039e`
- `f2b5ba3ed4888f88fd3b38717839962aaf55a3e3`
- `24a6425750bc45d5ff71caaf76ffcb973444f958`

## MSIX Build and Install

Command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\run-msix-workflow.ps1 -Configuration release -StartupContract local-sideload-manual -AttemptInstall -VerifyInstalled -ReplaceExisting
```

Result:

- Rust release runtime build passed.
- Tauri desktop shell build passed.
- MSIX package creation and signing passed.
- Packaged startup smoke passed.
- Installed package contract verification passed.
- Local sideload/manual bridge contract was confirmed.
- package:
  `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- installed package: `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`

HUGH_SECOND still reports the known warning-mode PATH shadowing:

- `C:\Users\empty\.cargo\bin\musu.exe`
- packaged WindowsApps alias:
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`

The packaged alias and installed package contract still verify.

## Fresh Evidence

Single-machine smoke:

- `docs\evidence\single-machine\1.15.0-rc.1\20260605-014639-HUGH_SECOND.evidence.json`
- dashboard: `http://127.0.0.1:3001`
- bridge: `http://127.0.0.1:13047`
- task id: `da44c52d-6b0c-4c97-8003-176a717c0646`
- output: `MUSU_RELEASE_SMOKE_OK_20260605_014606`
- CLI route checked: `true`

Desktop-open idle CPU:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-014927-HUGH_SECOND.desktop-open.evidence.json`
- `ok=true`
- `git_dirty=false`
- sample duration: `60.066s`
- MUSU max CPU: `0.21%` of one logical core
- Node max CPU: `0.03%` of one logical core
- WebView2 max CPU: `0.34%` of one logical core
- owned WebView2 processes: `6`
- working set: `450.8MB`
- hot processes: `0`

Runtime CPU scenario matrix:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-015132-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `ok=true`
- `git_dirty=false`
- `fail_count=0`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_015132`
- scenarios: `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`, `post-route`
- max working set across scenarios: `454.36MB`

Scenario summary:

| Scenario | MUSU | Node | WebView2 | Working set | Hot |
|---|---:|---:|---:|---:|---:|
| `startup-open` | `0` | `0.05` | `0.16` | `452.63MB` | `0` |
| `runtime-started` | `0` | `0` | `0.05` | `451.64MB` | `0` |
| `dashboard-open` | `0.1` | `0.13` | `0.18` | `454.36MB` | `0` |
| `desktop-open` | `0` | `0` | `0.1` | `454.11MB` | `0` |
| `post-route` | `0.47` | `0.08` | `0.16` | `454.24MB` | `0` |

The matrix verifier passed with:

- `ok=true`
- `fail_count=0`
- required scenarios present
- post-route probe successful
- clean git capture
- no resource budget violations

## Go/No-Go

`write-release-go-no-go.ps1 -ScriptTimeoutSeconds 240 -Json` completed at
`2026-06-05T02:00:01+09:00`.

Key result:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `multi_device_verified=false`
- `public_metadata_ok=true`
- `msix_install_verified=true`
- `msix_desktop_entrypoint_verified=true`
- `manifest_git.dirty=false`

Public release remains No-Go.

## Remaining Blockers

Still open:

- second-PC install/runtime/multi-device evidence,
- two-machine desktop-open idle CPU evidence,
- two-machine runtime CPU scenario matrix evidence,
- hosted MUSU.PRO P2P control-plane proof,
- release-grade relay connect/payload transport proof,
- relay payload delivery proof,
- support mailbox evidence, and
- Store evidence.

The current one-machine evidence supports the local idle CPU/resource-budget
part of the objective. It does not prove the required two-machine release gate.
