# Release 1.15.0-rc.1 Post Work-Order Context Primary Evidence Refresh - 2026-06-04

## Summary

Fresh primary-machine packaged evidence was restored after MUSU.PRO work-order
context hardening.

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

## Evidence

Source commit after work-order context hardening:

- `81b98fbea9d1b5c6fef254d4155d6221255e50fa`

Final evidence/docs HEAD:

- `d8e91f0fe75c68647438d61f1ac01ab68f00624c`

MSIX:

- package: `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- installed package: `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- strict install evidence:
  `docs\evidence\msix-install\1.15.0-rc.1\20260604-164153-HUGH_SECOND.evidence.json`
- alias mode: `fail`
- alias shadowing accepted: `false`
- WindowsApps alias was first during strict capture

Single-machine smoke:

- evidence:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-164313-HUGH_SECOND.evidence.json`
- dashboard: `http://127.0.0.1:3001`
- reachable app URL: `http://127.0.0.1:3001/app`
- source: `musu up.dashboard.reachable_url`
- bridge: `http://127.0.0.1:11480`
- dashboard output: `MUSU_RELEASE_SMOKE_OK_20260604_164246`
- CLI route checked: `true`

Desktop-open CPU:

- evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-164620-HUGH_SECOND.desktop-open.evidence.json`
- sample: `60.065s`
- `git_dirty=false`
- process counts: MUSU `2`, repo Node `1`, owned WebView2 `6`
- max one-core CPU: MUSU `0`, Node `0`, WebView2 `0.18`
- working set: `466.49MB`
- hot process count: `0`

Five-state runtime CPU matrix:

- evidence:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-164933-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-164933-HUGH_SECOND.verification.json`
- verifier: `ok=true`, `fail_count=0`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_164933`
- route attempt count: `1`
- `git_dirty=false`

Scenario maxima:

- `startup-open`: MUSU `0`, Node `0.03`, WebView2 `0.05`, working set
  `470.45MB`, hot `0`
- `runtime-started`: MUSU `0.03`, Node `0`, WebView2 `0.18`, working set
  `470.42MB`, hot `0`
- `dashboard-open`: MUSU `0`, Node `0`, WebView2 `0.08`, working set
  `470.22MB`, hot `0`
- `desktop-open`: MUSU `0`, Node `0`, WebView2 `0.05`, working set
  `470.97MB`, hot `0`
- `post-route`: MUSU `0`, Node `0.03`, WebView2 `0.08`, working set
  `468.91MB`, hot `0`

## Go/No-Go

Clean go/no-go on `d8e91f0fe75c68647438d61f1ac01ab68f00624c`:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `msix_desktop_entrypoint_verified=true`
- `public_metadata_ok=true`
- runtime idle CPU: `1/2 [HUGH_SECOND]`
- runtime CPU scenario matrix: `1/2 [HUGH_SECOND]`
- `multi_device_verified=false`
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

## Interpretation

This evidence confirms the work-order context hardening did not introduce a
packaged runtime CPU/process regression on the primary machine. It also keeps
the product split explicit: MUSU.PRO handles identity, project context, meeting
room coordination, work-order input, rendezvous, fallback relay, and evidence;
the local MUSU program on each device performs execution and should prefer P2P
mesh transport after rendezvous.

## Next

Proceeding beyond one-machine requires a second Windows PC with this current
MUSU build installed. That second machine must return the current multi-device
route proof, runtime idle CPU proof, and five-state runtime CPU matrix proof.
