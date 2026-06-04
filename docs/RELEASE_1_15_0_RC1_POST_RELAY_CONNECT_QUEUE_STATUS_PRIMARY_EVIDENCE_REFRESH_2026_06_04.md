# Release 1.15.0-rc.1 Post Relay Connect/Queue Status Primary Evidence Refresh - 2026-06-04

## Summary

Fresh primary-machine packaged evidence was restored after the relay connect /
preview queue status split.

The product roadmap remains locked:

- `localhost` and `127.0.0.1` dashboards are local-only operator/dev surfaces.
- `musu.pro` is the web input, project room, company meeting room, rendezvous,
  path-selection, relay-fallback coordination, and evidence plane.
- Local MUSU programs execute the real work on each device.
- MUSU.PRO should deliver authenticated work orders and coordination state to
  local runtimes; it should not become the runtime that performs local work.
- Devices can use MUSU.PRO for identity, presence, and rendezvous, then prefer
  direct P2P mesh routes.
- Relay remains fallback only, with `relay_default_data_path=false`.

Current validation is still one-machine. Second-PC route, CPU, and P2P proof
require installing this same current MUSU build on another Windows machine.

## Localhost Interpretation

The packaged smoke resolved the dashboard through runtime discovery:

- dashboard: `http://127.0.0.1:3001`
- source: `musu up.dashboard.reachable_url`
- bridge: `http://127.0.0.1:2817`

So `ERR_CONNECTION_REFUSED` on `127.0.0.1:3001/app` means the local MUSU
runtime/dashboard is not running or not ready in that local environment. It is
not the public MUSU.PRO web control plane.

## Evidence

Source commit after relay status split:

- `b76fa20bf7901f9fec514c526dfabfaca1b622af`

Final evidence/docs HEAD:

- `c3d36a7be54f0c3cc9639ede3625d5d91478b20c`

MSIX:

- package: `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- installed package: `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- strict install evidence:
  `docs\evidence\msix-install\1.15.0-rc.1\20260604-155606-HUGH_SECOND.evidence.json`
- alias mode: `fail`
- alias shadowing count: `0`
- first alias: `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`

Single-machine smoke:

- evidence:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-154159-HUGH_SECOND.evidence.json`
- dashboard output: `MUSU_RELEASE_SMOKE_OK_20260604_154129`
- dashboard task: `f16d5bb9-eed4-42c9-9b7c-ccda14e68786`
- CLI route checked: `true`

Desktop-open CPU:

- evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-154401-HUGH_SECOND.desktop-open.evidence.json`
- sample: `60.055s`
- `git_dirty=false`
- process counts: MUSU `2`, repo Node `1`, owned WebView2 `6`
- max one-core CPU: MUSU `0`, Node `0.05`, WebView2 `1.09`
- working set: `483.5MB`
- hot process count: `0`

Five-state runtime CPU matrix:

- evidence:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-154626-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verifier: `ok=true`, `fail_count=0`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_154626`
- route attempt count: `1`
- `git_dirty=false`

Scenario maxima:

- `startup-open`: MUSU `0.03`, Node `0.03`, WebView2 `1.35`, working set
  `472.66MB`, hot `0`
- `runtime-started`: MUSU `0`, Node `0.03`, WebView2 `0.57`, working set
  `473.75MB`, hot `0`
- `dashboard-open`: MUSU `0`, Node `0.05`, WebView2 `0.39`, working set
  `474.04MB`, hot `0`
- `desktop-open`: MUSU `0`, Node `0`, WebView2 `0.18`, working set
  `473.63MB`, hot `0`
- `post-route`: MUSU `0`, Node `0.08`, WebView2 `0.05`, working set
  `477.14MB`, hot `0`

## Go/No-Go

Clean go/no-go on `c3d36a7be54f0c3cc9639ede3625d5d91478b20c`:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `msix_desktop_entrypoint_verified=true`
- `public_metadata_ok=true`
- runtime idle CPU: `1/2 [HUGH_SECOND]`
- runtime CPU scenario matrix: `1/2 [HUGH_SECOND]`
- `p2p_control_plane_verified=false`
- `manifest_git.dirty=false`
- blocker count: `6`

Remaining blockers:

- real second-PC multi-device route evidence
- second-PC `desktop-open` runtime idle CPU evidence
- second-PC five-state runtime CPU scenario matrix
- operator-verified `musu@musu.pro` support mailbox delivery
- Partner Center / Store release evidence
- live owner-scoped `https://musu.pro` P2P control-plane proof, including
  release-grade relay lease storage, release-grade relay payload transport, and
  relay payload delivery proof

## Notes

An earlier install capture in this session used
`AliasShadowingMode=warn-explicit-windowsapps` because the current Codex
PowerShell process had a stale PATH ordering with `.cargo\bin` before
WindowsApps. The actual User PATH already had WindowsApps before `.cargo\bin`.
The strict capture reloaded Machine/User PATH and recorded release-grade alias
ordering with no shadowing.

## Next

Proceeding beyond one-machine requires a second Windows PC with this current
MUSU build installed. That second machine must return the current multi-device
route proof, runtime idle CPU proof, and five-state runtime CPU matrix proof.
MUSU.PRO work should continue as the authenticated web input/project-room/
rendezvous/evidence plane, with local runtimes executing work and P2P mesh
remaining the preferred data path after rendezvous.
