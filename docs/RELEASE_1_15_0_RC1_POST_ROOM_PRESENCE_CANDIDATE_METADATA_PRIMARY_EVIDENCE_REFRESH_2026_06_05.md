# RC1 Post Room Presence Candidate Metadata Primary Evidence Refresh

Date: 2026-06-05 09:46 KST

## Summary

After the Rust local room presence publisher started emitting public/NAT/relay
candidate metadata, the primary-machine packaged local-runtime evidence was
refreshed for the current source.

This confirms the local runtime / web control-plane split:

- the installed local MUSU program is the executor
- `musu.pro` is the remote input, project room, rendezvous, path-selection,
  relay-fallback, and evidence surface
- `localhost:3001` remains an optional workspace dashboard

## Build And Install

- Release MSIX build/install/packaged-state verification passed for
  `musu_1.15.0.0_x64_local-sideload-manual.msix`.
- Packaged runtime repair passed through the WindowsApps alias.
- Local bridge: `http://127.0.0.1:10325`
- `dashboard.required=false`
- Strict MSIX install evidence capture still failed because
  `C:\Users\empty\.cargo\bin\musu.exe` shadows the WindowsApps alias.

## Fresh Evidence

- Single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-092924-HUGH_SECOND.evidence.json`
- Idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-093206-HUGH_SECOND.desktop-open.evidence.json`
- Runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-094033-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- Runtime CPU matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-094033-HUGH_SECOND.verification.json`

## Results

- Single-machine smoke passed with `dashboard_required=false`,
  `single_machine_surface=local-bridge-only`, bridge
  `http://127.0.0.1:10325`, and CLI route checked.
- Desktop-open idle CPU passed for `60.053s`.
- Idle CPU maxima: MUSU `0`, Node `0`, WebView2 `0.44`.
- Idle CPU working set: `364.26MB`.
- Idle CPU hot process count: `0`.
- Runtime CPU matrix passed verifier with `ok=true` and `fail_count=0`.
- Route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_094033`.
- Route task: `6b7e1ccc-97c1-466f-9354-fedd3ef3583d`.
- Matrix role maxima: MUSU `0.05`, Node `0`, WebView2 `0.16`.
- Matrix max working set: `366.33MB`.
- `dashboard-open` measured packaged runtime state because no dashboard URL was
  exposed; it did not depend on `localhost:3001`.

## Release Status

This restores current one-machine packaged runtime evidence only. Public
release remains blocked on:

- second-PC install, route, CPU, and matrix evidence
- hosted `musu.pro` production KV/Upstash configuration
- release-grade relay connect/payload transport proof
- owner-scoped route/relay evidence
- support mailbox evidence
- Store/Microsoft approval evidence
