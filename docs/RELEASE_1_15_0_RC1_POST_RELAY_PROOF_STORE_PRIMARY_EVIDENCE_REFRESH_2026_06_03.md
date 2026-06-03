# MUSU 1.15.0-rc.1 Post Relay Proof Store Primary Evidence Refresh

Date: 2026-06-03

## Summary

After the relay transport proof store gate, the local-sideload MSIX was rebuilt,
reinstalled, and current primary-machine evidence was refreshed.

This restores current-source primary evidence after the route-evidence source
change that added owner-scoped relay transport proof store binding.

## Build And Install

- Package: `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- Artifact:
  `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- Startup contract: `local-sideload-manual`
- Installed package contract: passed
- Local sideload contract: confirmed
- PATH alias warning remains: `C:\Users\empty\.cargo\bin\musu.exe` shadows the
  WindowsApps alias, so release smoke used the explicit WindowsApps alias.

## Evidence

- Single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-232213-HUGH_SECOND.evidence.json`
- Desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-232423-HUGH_SECOND.desktop-open.evidence.json`
- Runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-232620-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

## Results

Single-machine smoke:

- output: `MUSU_RELEASE_SMOKE_OK_20260603_232146`
- dashboard: `http://127.0.0.1:3001`
- bridge: `http://127.0.0.1:11952`
- task: `1948b1f1-da2d-4df8-abd6-21eff940ad8a`
- CLI route checked: `true`

Desktop-open CPU:

- sample: `60.046s`
- git clean: `true`
- MUSU max one-core CPU: `0`
- Node max one-core CPU: `0.03`
- WebView2 max one-core CPU: `0.39`
- hot process count: `0`
- working set: `462.32MB`

Five-state runtime CPU matrix:

- verifier: `ok=true`, `fail_count=0`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_232620`
- startup-open max CPU: MUSU `2.37`, Node `0.03`, WebView2 `0.34`
- runtime-started max CPU: MUSU `2.03`, Node `0.03`, WebView2 `0.05`
- dashboard-open max CPU: MUSU `0`, Node `0`, WebView2 `0.1`
- desktop-open max CPU: MUSU `0.1`, Node `0.05`, WebView2 `0.18`
- post-route max CPU: MUSU `0.03`, Node `0`, WebView2 `0.05`
- max working set: `472.9MB`
- hot process count: `0` in all scenarios

## Go/No-Go

Clean go/no-go on commit `4ab4281fab5b3f403876a39a1e48bbe1f21bf60e` reports:

- `local_artifacts_ready=true`
- `single_machine_verified=true`
- runtime idle CPU `1/2`
- runtime CPU matrix `1/2`
- `manifest_dirty=false`
- public release `ready=false`

Remaining blockers:

- real second-PC multi-device evidence
- second-machine desktop-open idle CPU evidence
- second-machine five-state runtime CPU matrix evidence
- hosted `https://musu.pro` release-grade relay payload transport proof
- `musu@musu.pro` support mailbox verification
- Partner Center / Store certification evidence
