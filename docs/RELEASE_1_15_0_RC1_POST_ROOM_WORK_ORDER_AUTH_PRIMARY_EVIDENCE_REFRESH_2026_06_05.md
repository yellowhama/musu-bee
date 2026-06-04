# MUSU 1.15.0-rc.1 Post Room Work-Order Auth Primary Evidence Refresh

**Wiki ID**: wiki/712
**Date**: 2026-06-05
**Commit under test**: `aa52b243cb6b1b8350f060516e72c26d730da059`
**Machine**: `HUGH_SECOND`
**Status**: Primary local evidence restored. Public release remains No-Go.

## Product Boundary

This refresh records the current roadmap decision:

- `musu.pro` is the remote input, project-room, company-room, presence,
  rendezvous, path-selection, relay-fallback coordination, and evidence plane.
- The installed MUSU program is the execution plane on each device.
- A user can enter a work order through the web, but the selected local MUSU
  program performs the work locally.
- Local programs should use the web plane to bootstrap discovery and then prefer
  P2P mesh paths in order: `lan`, `tailscale`, `direct_quic`, then `relay`.
- Project/company rooms can coordinate local AI agents, decisions, and handoffs,
  but room work orders must be owner-scoped before reaching any local bridge.

Current validation is still a one-machine test. Multi-device release proof still
requires the same current build installed on another Windows PC.

## Build And Install

After room work-order auth hardening, the local-sideload MSIX was rebuilt and
reinstalled:

- command: `scripts\windows\run-msix-workflow.ps1 -Configuration release
  -StartupContract local-sideload-manual -AttemptInstall -VerifyInstalled
  -ReplaceExisting`
- release runtime build passed
- Tauri desktop shell build passed
- local-sideload MSIX packed, signed, installed, and verified
- packaged startup smoke passed
- package: `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- installed package: `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- HUGH_SECOND still has warning-mode `.cargo\bin\musu.exe` PATH shadowing, so
  packaged checks used the installed WindowsApps package path.

## Fresh Evidence

Single-machine smoke:

- evidence:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-004553-HUGH_SECOND.evidence.json`
- verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-004553-HUGH_SECOND.verification.json`
- summary:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-004553-HUGH_SECOND.summary.md`
- dashboard: `http://127.0.0.1:3001`
- reachable app URL: `http://127.0.0.1:3001/app`
- bridge: `http://127.0.0.1:2877`
- dashboard task id: `83f8f35a-4c69-43f1-aae0-f8a9c8e12636`
- dashboard output: `MUSU_RELEASE_SMOKE_OK_20260605_004448`
- CLI route checked: `true`
- CLI route output contained `MUSU_CLI_ROUTE_OK_20260605_004448`

Desktop-open CPU:

- evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-004657-HUGH_SECOND.desktop-open.evidence.json`
- sample: `60.057s`
- MUSU CPU: `0`
- Node CPU: `0`
- WebView2 CPU: `0.39`
- process counts by role: MUSU `2`, Node `1`, WebView2 `6`, other `0`
- owned process count: `9`
- owned WebView2 process count: `6`
- working set: `489.86MB`
- private memory: `371.8MB`
- hot process count: `0`

Five-state runtime CPU matrix:

- evidence:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-004808-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verifier: `ok=true`, `fail_count=0`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_004808`
- route probe: `ok=true`, attempt count `1`

Scenario summary:

| Scenario | MUSU | Node | WebView2 | Working set | Hot |
|---|---:|---:|---:|---:|---:|
| `startup-open` | `0.03` | `0` | `0.31` | `490.68MB` | `0` |
| `runtime-started` | `0.08` | `0.03` | `0.18` | `491.28MB` | `0` |
| `dashboard-open` | `0.57` | `0.08` | `0.39` | `490.96MB` | `0` |
| `desktop-open` | `0` | `0.08` | `0.23` | `491.21MB` | `0` |
| `post-route` | `0` | `0.03` | `0.65` | `492.2MB` | `0` |

Matrix maxima:

- MUSU CPU: `0.57`
- Node CPU: `0.08`
- WebView2 CPU: `0.65`
- working set: `492.2MB`
- hot process count: `0`

## Verification

- `verify-single-machine-evidence.ps1` passed with `ok=true`, `fail_count=0`.
- `verify-runtime-cpu-scenario-matrix.ps1` passed with `ok=true`,
  `fail_count=0`.
- `npm run test:routes` passed `19/19` before this refresh.
- `audit-operator-api-security-contract.ps1 -FailOnProblem -Json` passed with
  `ok=true`, `fail_count=0` before this refresh.
- `npm run typecheck` passed before this refresh.
- `npm run test:p2p` passed `77/77` before this refresh.
- `npm run build` passed before this refresh.
- `git diff --check` passed before this refresh.

## Release Decision

This restores current primary-machine packaged evidence after commit
`aa52b243`. It does not close the public release gate.

Remaining blockers:

- real second-PC multi-device evidence
- two-machine runtime idle CPU evidence
- two-machine runtime CPU scenario matrix evidence
- hosted `musu.pro` P2P control-plane proof
- release-grade relay/tunnel payload proof
- support mailbox delivery proof for `musu@musu.pro`
- Microsoft Store reservation/submission/certification evidence

