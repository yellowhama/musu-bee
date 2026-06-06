# MUSU 1.15.0-rc.1 Current Desktop Clean-Start Evidence, Audit, and Next Steps

**Wiki ID**: wiki/857
**Date**: 2026-06-06 KST

## Summary

Current source after runtime relay candidate coverage carry was rebuilt into
the local-sideload MSIX, reinstalled on `HUGH_SECOND`, and revalidated as MUSU
Desktop rather than the localhost developer dashboard.

The one-machine desktop result is healthy:

- MSIX install evidence passes strict alias mode.
- Single-machine smoke passes as `local-bridge-only`.
- Packaged `desktop-open` idle CPU passes for 60 seconds with owned WebView2.
- Full five-scenario runtime CPU matrix passes with a successful local
  `post-route` probe.
- Clean go/no-go recognizes the current one-machine evidence, but public
  release remains No-Go because second-PC, live hosted P2P relay proof, support
  mailbox, and Store gates remain open.

## Localhost Root Cause

The repeated `ERR_CONNECTION_REFUSED` confusion was not evidence that MUSU
Desktop failed. `http://127.0.0.1:3001/app` is a local-only dashboard URL and
is not the packaged desktop runtime contract.

During the MSIX workflow the current Codex/PowerShell process had a stale PATH
that resolved `C:\Users\empty\.cargo\bin\musu.exe` before the WindowsApps
execution alias. Persisted User PATH was already correct:

- first alias: `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- alternate alias: `C:\Users\empty\.cargo\bin\musu.exe`

The clean evidence commands therefore used the explicit WindowsApps alias or a
fresh User+Machine PATH. The strict MSIX install evidence now reports no alias
shadowing.

## Evidence

MSIX install:

- evidence:
  `docs\evidence\msix-install\1.15.0-rc.1\20260606-171011-HUGH_SECOND.evidence.json`
- verification:
  `docs\evidence\msix-install\1.15.0-rc.1\20260606-171011-HUGH_SECOND.verification.json`
- package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- startup contract: `local-sideload-manual`
- alias shadowing mode: `fail`
- first alias path:
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`

Single-machine packaged local runtime:

- evidence:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-170759-HUGH_SECOND.evidence.json`
- verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-170759-HUGH_SECOND.verification.json`
- result: `ok=true`
- surface: `local-bridge-only`
- bridge: `http://127.0.0.1:4751`
- dashboard required: `false`
- CLI route checked: `true`

Desktop-open idle CPU:

- evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-171154-HUGH_SECOND.desktop-open.evidence.json`
- result: `ok=true`
- `git_dirty=false`
- sample: `60.043s`
- process counts: MUSU `2`, Node `0`, WebView2 `6`, other `0`
- subroles: `bridge_runtime=1`, `desktop_shell=1`, `webview2_helper=6`
- max one-core CPU: MUSU `0`, Node `0`, WebView2 `0.23`, other `0`
- working set after sample: `363.69MB`
- hot process count: `0`

Full runtime CPU scenario matrix:

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-171403-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-171403-HUGH_SECOND.verification.json`
- verifier result: `ok=true`, `fail_count=0`
- scenarios: `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`, `post-route`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260606_171403`
- route task: `08b81687-bacf-40eb-a677-e92fca76149b`
- route target: local/default

Scenario maxima:

| Scenario | MUSU | Node | WebView2 | Working set | Hot |
|---|---:|---:|---:|---:|---:|
| `startup-open` | `0` | `0` | `0.08` | `365.05MB` | `0` |
| `runtime-started` | `0` | `0` | `0.03` | `364.86MB` | `0` |
| `dashboard-open` | `0` | `0` | `0.10` | `366.56MB` | `0` |
| `desktop-open` | `0` | `0` | `0.08` | `366.65MB` | `0` |
| `post-route` | `0` | `0` | `0.08` | `365.87MB` | `0` |

## Go/No-Go Snapshot

Clean go/no-go after the current evidence commits reports:

- `single_machine_verified=true`
- `msix_install_verified=true`
- `runtime_idle_cpu_valid_machine_count=1`
- `runtime_cpu_scenario_matrix_valid_machine_count=1`
- `manifest_git.dirty=false`

Public desktop release remains No-Go with these blockers:

- `multi-device`: real second-PC multi-device evidence has not been recorded.
- `runtime-idle-cpu`: needs valid `desktop-open` CPU evidence on two machines.
- `runtime-cpu-scenario-matrix`: needs the five-scenario matrix on two
  machines.
- `runtime-cpu-second-pc-route-attempt`: needs a targeted second-PC route
  attempt CPU sample on at least one machine.
- `support-mailbox`: `musu@musu.pro` delivery is not operator-verified.
- `store-release`: Partner Center/certification/restricted capability evidence
  is not recorded.
- `p2p-control-plane`: live `https://musu.pro` release relay route, transport,
  and payload delivery proof remain incomplete.

## Code Audit

No new runtime source was changed during this evidence refresh. The relevant
source hardening remains the prior runtime relay candidate coverage carry
commit.

Audit result:

- no high/medium issue found in the current evidence refresh
- MSIX rebuild/install passed
- strict MSIX install evidence passed
- single-machine smoke passed
- `desktop-open` idle CPU passed
- five-scenario runtime CPU matrix passed
- matrix verifier passed with `fail_count=0`

Residual risk:

- This proves the current installed build on one Windows machine only.
- It does not prove a second Windows PC, a real P2P mesh path, or live hosted
  release relay payload transport.
- The Cargo `musu.exe` remains an alternate developer alias; it is safe only
  because persisted PATH resolves WindowsApps first for release evidence.

## Product Boundary

The product split is unchanged and should stay explicit:

- MUSU Desktop is the local program and local executor.
- MUSU Desktop owns files, shell/app/browser automation, the local bridge,
  local CPU/memory budget, and P2P traffic.
- MUSU.PRO is remote input, project/company room, AI meeting room, presence,
  rendezvous, path-selection, relay-fallback coordination, and evidence/control
  plane.
- MUSU.PRO can make P2P bootstrap easier, but after rendezvous the preferred
  path order remains direct P2P: `lan`, `tailscale`, `direct_quic`, then relay
  fallback.
- `localhost:3001` is optional local/developer dashboard surface, not the
  packaged desktop success criterion.

## Next Step Document

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_CURRENT_DESKTOP_CLEAN_START_EVIDENCE_2026_06_06.md`
