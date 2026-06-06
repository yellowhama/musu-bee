# MUSU 1.15.0-rc.1 Current Packaged Local Evidence Refresh

**Wiki ID**: wiki/829
**Date**: 2026-06-06

## Summary

Current packaged MUSU Desktop local-runtime evidence was refreshed on
`HUGH_SECOND` after the MSIX alias persisted PATH gate.

The local one-machine result is healthy:

- installed packaged WindowsApps runtime identity is used
- single-machine smoke passes without requiring the localhost developer
  dashboard
- desktop-open idle CPU passes on `HUGH_SECOND`
- full runtime CPU scenario matrix passes on `HUGH_SECOND`
- targeted HUGH-MAIN post-route CPU diagnostic passes as an allowed failed
  route attempt with healthy local CPU

Public desktop release is still `No-Go`. The remaining blockers are external
or two-machine gates, not a reproduced local busy-loop on this machine.

## Evidence

Single-machine packaged local runtime:

- evidence:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-114258-HUGH_SECOND.evidence.json`
- verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-114258-HUGH_SECOND.verification.json`
- summary:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-114258-HUGH_SECOND.summary.md`
- result: `ok=true`
- bridge: `http://127.0.0.1:3622`
- dashboard required: `false`
- surface: `local-bridge-only`

Desktop-open idle CPU:

- evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-114621-HUGH_SECOND.desktop-open.evidence.json`
- result: `ok=true`
- sample: `60.062s`
- `git_dirty=false`
- process counts: MUSU `2`, Node `0`, WebView2 `6`, other `0`
- subroles: `bridge_runtime=1`, `desktop_shell=1`, `webview2_helper=6`
- max one-core CPU: MUSU `0.03`, Node `0`, WebView2 `0.10`, other `0`
- hot process count: `0`

Full runtime CPU scenario matrix:

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-120547-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-120547-HUGH_SECOND.verification.json`
- verifier result: `ok=true`, `fail_count=0`
- scenarios: `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`, `post-route`
- route probe: successful local post-route probe
- hot process count: `0` in all scenarios
- max observed WebView2 CPU: `0.13`

Targeted HUGH-MAIN route CPU diagnostic:

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-121806-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-121806-HUGH_SECOND.verification.json`
- verifier result: `ok=true`, `fail_count=0`
- target: `HUGH-MAIN`
- route probe: `ok=false`, `failure_allowed=true`
- failure: request to
  `http://192.168.1.192:8949/api/tasks/delegate` timed out
- CPU after failed route attempt: `60.071s`, MUSU `0`, Node `0`, WebView2
  `0.03`, hot `0`, working set `363.93MB`

The targeted HUGH-MAIN diagnostic is not a successful second-PC route proof.
It only proves that a known failed route attempt does not cause a local CPU
busy-loop on `HUGH_SECOND`.

## Clean Go/No-Go

Clean release aggregation at `2026-06-06T12:21:29+09:00` on commit
`168f4530ced1551eade17bb1c937dcaa0eed8ff7` reported:

- `ready_for_public_desktop_release=false`
- `git_dirty=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `msix_desktop_entrypoint_verified=true`
- `public_metadata_ok=true`
- `msix_current_legacy_conflicts_ok=true`
- `current_process_path_stale=true` as diagnostic only
- `runtime_idle_cpu_valid_machine_count=1/2`
- `runtime_cpu_scenario_matrix_valid_machine_count=1/2`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- `runtime_cpu_second_pc_route_attempt_valid_machine_count=1/1`

Remaining blockers:

- `multi-device`: real second-PC multi-device evidence has not been recorded.
- `runtime-idle-cpu`: needs valid `desktop-open` CPU evidence on two machines.
- `runtime-cpu-scenario-matrix`: needs the full successful matrix on two
  machines.
- `support-mailbox`: `musu@musu.pro` delivery is not operator-verified.
- `store-release`: Partner Center, certification, and restricted capability
  evidence is not recorded.
- `p2p-control-plane`: live `https://musu.pro` evidence still lacks
  owner-scoped release-grade relay lease storage, non-default relay data path,
  wired relay status/transport/payload endpoint proof, route transport proof,
  and relay payload delivery proof.

Warnings: none.

## Qualitative Evaluation

The local packaged runtime quality signal is good on `HUGH_SECOND`.

- The installed MUSU Desktop/bridge process pair is stable.
- The local bridge is reachable on `127.0.0.1:3622`.
- The packaged runtime does not need `localhost:3001`.
- The repeated browser `ERR_CONNECTION_REFUSED` on `localhost:3001` is a
  developer dashboard availability issue, not evidence that the local program
  is down.
- CPU evidence shows no hot process and no observed 20% busy-loop.
- WebView2 helper count and working set remain inside release budgets.

The release risk that remains is not "does MUSU Desktop run locally on this
machine." It is whether the same packaged runtime can be proven on a second
Windows PC, and whether MUSU.PRO can prove its hosted P2P control-plane and
relay evidence requirements.

## Code Audit

No high or medium issue was found in the current evidence/doc/code surface.

Validation performed in this cycle:

- `verify-runtime-cpu-scenario-matrix.ps1` for the full matrix:
  `ok=true`, `fail_count=0`
- `verify-runtime-cpu-scenario-matrix.ps1` for targeted HUGH-MAIN diagnostic:
  `ok=true`, `fail_count=0`
- clean `write-release-go-no-go.ps1 -Json` summary:
  `git_dirty=false`, `ready=false`, target route CPU diagnostic `1/1`
- release verifier regression after the MSIX alias gate:
  `ok=true`, `case_count=61`, `failed_case_count=0`

The only caveat is intentional: a failed HUGH-MAIN timeout cannot be counted as
multi-device success. It only closes the targeted failed-route CPU diagnostic
gate.

## Product Spec Impact

The product boundary is now restated as the working spec:

- MUSU Desktop is the local executor on each device.
- MUSU.PRO is the remote input, project/company room, presence, rendezvous,
  path-selection, relay-fallback, and evidence/control-plane service.
- A user may submit an order through MUSU.PRO from another location.
- The actual work still runs on the local MUSU program attached to the target
  machine.
- Local MUSU programs may use MUSU.PRO to bootstrap discovery and meeting-room
  coordination.
- After bootstrap, direct P2P mesh remains preferred.
- Hosted relay remains fallback-only and cannot be a default data path until
  release-grade tunnel payload proof exists.

This matches the user-facing model: MUSU.PRO can be the "company meeting room"
for AIs/devices assigned to the same project, but the devices do the work
locally.

## Next Step Document

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_CURRENT_PACKAGED_LOCAL_EVIDENCE_REFRESH_2026_06_06.md`
