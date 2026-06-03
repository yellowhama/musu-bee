# MUSU 1.15.0-rc.1 Post Relay Transport Proof API Primary Evidence Refresh

Date: 2026-06-04
Wiki ID: wiki/650

## Summary

After the lease-bound relay transport proof record API landed, the
local-sideload MSIX was rebuilt, reinstalled, and primary-machine evidence was
refreshed on `HUGH_SECOND`.

The source gate landed on 2026-06-03, but the KST evidence capture crossed
midnight. The current primary evidence stamps are therefore `20260604-*`.

## Build And Install

- MSIX workflow: `scripts\windows\run-msix-workflow.ps1`
- configuration: `release`
- startup contract: `local-sideload-manual`
- installed package: `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- installed artifact:
  `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- startup smoke bridge: `127.0.0.1:7181`
- build duration: `9m 40s`

The PATH alias shadowing warning remains present for
`C:\Users\empty\.cargo\bin\musu.exe`; smoke and evidence used the explicit
WindowsApps alias.

## Fresh Evidence

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-000322-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-000405-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-000535-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- runtime CPU matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-000535-HUGH_SECOND.verification.json`

## Results

Single-machine smoke passed:

- dashboard: `http://127.0.0.1:3001`
- bridge: `http://127.0.0.1:3477`
- dashboard task: `836ed892-5340-4be4-8f44-ca897c8c5f49`
- output: `MUSU_RELEASE_SMOKE_OK_20260604_000259`
- CLI route checked: `true`

Desktop-open CPU passed for `60.059s`:

- MUSU max one-core CPU: `0.03`
- Node max one-core CPU: `0.03`
- WebView2 max one-core CPU: `0.57`
- process counts: MUSU `2`, Node `1`, WebView2 `6`
- hot process count: `0`
- working set: `453.71MB`

Five-state runtime CPU matrix passed verifier `ok=true`, `fail_count=0`:

- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_000535`
- route task: `701ecf63-52e8-4682-8419-9c90529d456e`
- bridge: `http://127.0.0.1:3477`
- dashboard: `http://127.0.0.1:3001/app`

Scenario max one-core CPU:

- `startup-open`: MUSU `0.03`, Node `0.03`, WebView2 `0.47`
- `runtime-started`: MUSU `0`, Node `0.03`, WebView2 `0.13`
- `dashboard-open`: MUSU `0`, Node `0`, WebView2 `0.13`
- `desktop-open`: MUSU `0`, Node `0.03`, WebView2 `0.42`
- `post-route`: MUSU `0.03`, Node `0.05`, WebView2 `0.21`

## Go/No-Go

Clean go/no-go generated at `2026-06-04T00:16:47.6824922+09:00` on commit
`049a9a9a7cf85c7231db44884b405a9a4d2f2308` reports:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `multi_device_verified=false`
- runtime idle CPU valid machines: `1/2`
- runtime CPU scenario matrix valid machines: `1/2`
- P2P relay route evidence count: `0`
- relay payload transport proven: `false`
- `manifest_git.dirty=false`
- blocker count: `6`

Remaining blockers:

- real second-PC multi-device evidence
- second-machine desktop-open runtime idle CPU evidence
- second-machine five-state runtime CPU matrix evidence
- `musu@musu.pro` mailbox delivery evidence
- Partner Center / Store release evidence
- live `https://musu.pro` P2P control-plane evidence with release-grade relay
  payload transport proof count greater than zero

## Release Interpretation

Current primary-machine packaged evidence is restored after the relay transport
proof record API source change.

Public release remains No-Go. The relay proof record API is only the
owner-scoped proof write/query contract; it does not prove that relay payload
bytes currently transit through MUSU infrastructure.
