# MUSU 1.15.0-rc.1 Post CLI Route Wait Primary Evidence Refresh - 2026-06-04

## Scope

This refresh restores clean primary-machine evidence after the CLI route wait
hardening and web-input/local-executor roadmap update.

The product direction remains:

- `musu.pro` is the web input, project-room, rendezvous, fallback coordination,
  and evidence plane.
- Local MUSU programs execute work on their own machines.
- Web-originated commands are control-plane envelopes, not central execution.
- A second Windows machine must install the current MUSU build before
  two-machine runtime CPU, multi-device route, and P2P mesh proof can close.

## Evidence

MSIX install evidence:

- `docs\evidence\msix-install\1.15.0-rc.1\20260604-112129-HUGH_SECOND.evidence.json`
- package: `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- startup contract: `local-sideload-manual`
- alias shadowing mode: `fail`
- alias shadowing count: `0`

Single-machine smoke:

- `docs\evidence\single-machine\1.15.0-rc.1\20260604-112308-HUGH_SECOND.evidence.json`
- dashboard: `http://127.0.0.1:3001`
- bridge: `http://127.0.0.1:3153`
- task: `051218dc-059c-4eda-9254-fee608e44701`
- dashboard output: `MUSU_RELEASE_SMOKE_OK_20260604_112241`
- CLI output: `MUSU_CLI_ROUTE_OK_20260604_112241`

Desktop-open CPU:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-112809-HUGH_SECOND.desktop-open.evidence.json`
- sample: `60.062s`
- MUSU max one-core CPU: `0`
- Node max one-core CPU: `0.03`
- WebView2 max one-core CPU: `0.39`
- owned WebView2 process count: `6`
- working set: `489.98MB`
- hot processes: `0`

Five-state runtime CPU matrix:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-112954-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verifier: `ok=true`, `fail_count=0`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_112954`
- route probe: `ok=true`
- max one-core CPU across scenarios: MUSU `0.13`, Node `0.05`,
  WebView2 `0.13`
- max working set across scenarios: `490.17MB`
- hot processes across scenarios: `0`

## Go/No-Go

Clean go/no-go on commit `c9ada37ba675cff59b259bec05f30a72272d9641`
reports:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `multi_device_verified=false`
- `public_metadata_ok=true`
- `msix_install_verified=true`
- runtime idle CPU `1/2`
- runtime CPU matrix `1/2`
- `p2p_control_plane_verified=false`
- `support_mailbox_verified=false`
- `store_release_verified=false`
- `manifest_git.dirty=false`
- blocker count `6`

Remaining blocker areas:

- `multi-device`
- `runtime-idle-cpu`
- `runtime-cpu-scenario-matrix`
- `support-mailbox`
- `store-release`
- `p2p-control-plane`

## Interpretation

The current primary machine is back to a clean, current 1-machine state. This
does not prove the product-level remote ordering flow yet. The next release
proof step requires installing the current MUSU build on a second Windows PC,
then returning second-PC runtime CPU, runtime matrix, and multi-device route
evidence.

The `musu.pro` roadmap remains a web coordination layer: it should accept user
orders, create project rooms, help devices rendezvous, and record evidence.
Execution stays local unless the route explicitly falls back to a release-grade
hosted relay path with stored transport and delivery proof.
