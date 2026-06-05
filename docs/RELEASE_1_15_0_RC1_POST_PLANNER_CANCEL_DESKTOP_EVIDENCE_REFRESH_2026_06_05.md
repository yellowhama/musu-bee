# MUSU 1.15.0-rc.1 Post Planner-Cancel Desktop Evidence Refresh

Recorded: 2026-06-05 KST
Machine: HUGH_SECOND
Commit: `715f4b663c31751c6cf5e81bef9c754f96eab3b7`

## Boundary

MUSU Desktop is the local program. `127.0.0.1` is an internal local bridge for
that desktop/runtime, not the product surface a user should be sent to in a
browser. MUSU.PRO remains the remote input, project room, meeting room,
rendezvous, path-selection, relay-fallback, and evidence control plane. Local
MUSU programs on each device perform the work and prefer direct P2P mesh after
web-assisted rendezvous.

Current validation is still one-machine only. A second Windows PC must install
the current MUSU Desktop build before second-PC route, CPU, matrix, and real
multi-device gates can close.

## Evidence

- MSIX install evidence:
  `docs\evidence\msix-install\1.15.0-rc.1\20260605-184656-HUGH_SECOND.evidence.json`
- Single-machine evidence:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-184734-HUGH_SECOND.evidence.json`
- Desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-185714-HUGH_SECOND.desktop-open.evidence.json`
- Runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-185844-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- Runtime CPU matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-185844-HUGH_SECOND.verification.json`
- Targeted HUGH-MAIN route CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-190505-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- Targeted HUGH-MAIN route verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-190505-HUGH_SECOND.target-route.verification.json`

## Results

- Installed package: `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- Packaged bridge: `http://127.0.0.1:10346`
- Single-machine surface: `local-bridge-only`
- Desktop-open idle CPU: MUSU `0%`, Node `0%`, WebView2 `0.1%`, hot `0`
- Five-state matrix verifier: `ok=true`, `fail_count=0`
- Matrix route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_185844`
- Matrix max role CPU:
  - startup-open: MUSU `0%`, Node `0%`, WebView2 `0.08%`
  - runtime-started: MUSU `0%`, Node `0%`, WebView2 `0.1%`
  - dashboard-open: MUSU `0%`, Node `0%`, WebView2 `0.13%`
  - desktop-open: MUSU `0%`, Node `0%`, WebView2 `0.1%`
  - post-route: MUSU `0%`, Node `0%`, WebView2 `0.1%`
- Targeted HUGH-MAIN route attempt: timed out at
  `http://192.168.1.192:8949/api/tasks/delegate`
- Targeted post-route CPU: MUSU `0%`, Node `0%`, WebView2 `0.03%`, hot `0`

## Status

This restores current primary-machine packaged Desktop/local-runtime evidence
after planner-loop cancellation hardening and the clean reinstall. Public
release remains No-Go until second-PC multi-device/CPU/matrix evidence, hosted
MUSU.PRO P2P release proof, support mailbox evidence, and Store evidence are
complete.
