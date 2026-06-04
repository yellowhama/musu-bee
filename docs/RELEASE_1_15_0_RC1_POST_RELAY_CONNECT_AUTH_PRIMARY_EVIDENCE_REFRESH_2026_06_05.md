# MUSU 1.15.0-rc.1 Post Relay Connect Auth Primary Evidence Refresh

**Wiki ID**: wiki/710
**Date**: 2026-06-05
**Commit under test**: `68cc6f27407c68f1e0aac6615e21f86d19495568`
**Machine**: `HUGH_SECOND`
**Status**: Primary local evidence restored. Public release remains No-Go.

## Product Boundary

This refresh keeps the roadmap boundary explicit:

- `musu.pro` is the web control plane for user work orders, project rooms,
  company-room discussion, room presence, rendezvous, path selection, relay
  fallback coordination, and release evidence.
- The local MUSU program on each device executes the work, owns local files and
  process access, runs local browser/app automation, and joins the P2P mesh.
- A remote web user input can create a work order, but payload execution stays
  local. After web-assisted rendezvous, devices prefer P2P paths in order:
  `lan`, `tailscale`, `direct_quic`, then `relay`.
- Current validation is still a one-machine test. Real multi-device release
  proof requires installing the current build on another Windows PC and
  returning second-PC route, CPU, matrix, and release-grade P2P evidence.

## Build And Install

After relay connect auth hardening, the local-sideload MSIX was rebuilt and
reinstalled:

- command: `scripts\windows\run-msix-workflow.ps1 -Configuration release
  -StartupContract local-sideload-manual -AttemptInstall -VerifyInstalled
  -ReplaceExisting`
- release runtime build passed
- Tauri desktop shell build passed
- local-sideload MSIX packed, signed, installed, and verified
- packaged startup smoke passed
- installed package: `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- HUGH_SECOND still has warning-mode `.cargo\bin\musu.exe` PATH shadowing, so
  packaged checks used the installed WindowsApps package explicitly.

## Fresh Evidence

Single-machine smoke:

- evidence:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-000624-HUGH_SECOND.evidence.json`
- dashboard: `http://127.0.0.1:3001`
- reachable app URL: `http://127.0.0.1:3001/app`
- bridge: `http://127.0.0.1:13587`
- dashboard task id: `25e07b77-7376-43f6-b122-c8aec6bcd23c`
- dashboard output: `MUSU_RELEASE_SMOKE_OK_20260605_000551`
- CLI route checked: `true`

Desktop-open CPU:

- evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-000707-HUGH_SECOND.desktop-open.evidence.json`
- sample: `60.054s`
- MUSU CPU: `0`
- Node CPU: `0.05`
- WebView2 CPU: `0.52`
- owned process count: `9`
- owned WebView2 process count: `6`
- working set: `497.9MB`
- hot process count: `0`

Five-state runtime CPU matrix:

- evidence:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-000820-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verifier: `ok=true`, `fail_count=0`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_000820`
- route probe: `ok=true`

Scenario summary:

| Scenario | MUSU | Node | WebView2 | Working set | Hot |
|---|---:|---:|---:|---:|---:|
| `startup-open` | `0.03` | `0.05` | `0.52` | `496.67MB` | `0` |
| `runtime-started` | `0` | `0` | `0.16` | `496.96MB` | `0` |
| `dashboard-open` | `0.29` | `0` | `0.36` | `497.59MB` | `0` |
| `desktop-open` | `0` | `0.03` | `0.26` | `500.49MB` | `0` |
| `post-route` | `0` | `0.03` | `0.18` | `499.78MB` | `0` |

## Verification

- `verify-single-machine-evidence.ps1` passed with `ok=true`, `fail_count=0`.
- `verify-runtime-cpu-scenario-matrix.ps1` passed with `ok=true`,
  `fail_count=0`.
- `show-final-release-handoff-status.ps1 -Json` recognized:
  `single_machine_verified=true`, runtime idle CPU valid machines
  `1/2 [HUGH_SECOND]`, and runtime CPU matrix valid machines
  `1/2 [HUGH_SECOND]`.
- Dirty-tree handoff status correctly added the git blocker until this evidence
  and documentation are committed.

## Release Decision

This restores current primary-machine packaged evidence after commit `68cc6f27`.
It does not close the public release gate.

Remaining blockers:

- real second-PC multi-device evidence
- two-machine runtime idle CPU evidence
- two-machine runtime CPU scenario matrix evidence
- hosted `musu.pro` P2P control-plane proof
- release-grade relay/tunnel payload proof
- support mailbox delivery proof for `musu@musu.pro`
- Microsoft Store reservation/submission/certification evidence

