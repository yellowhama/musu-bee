# MUSU 1.15.0-rc.1 Post Room Event API Primary Evidence Refresh

Date: 2026-06-04 19:10 KST

## Summary

After adding `POST /api/rooms/[roomId]/events` and
`GET /api/rooms/[roomId]/events`, the local-sideload MSIX was rebuilt and
reinstalled, then primary-machine packaged evidence was refreshed on
`HUGH_SECOND`.

This restores the one-machine local evidence for the current room event source.
The product boundary remains unchanged: `musu.pro` coordinates user input,
rooms, rendezvous, path selection, relay fallback, and evidence; local MUSU
programs execute work on each device.

## Evidence

- Single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-185920-HUGH_SECOND.evidence.json`
- Desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-190029-HUGH_SECOND.desktop-open.evidence.json`
- Five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-190203-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

## Results

- `install-and-verify-msix.ps1 -StartupContract local-sideload-manual
  -ReplaceExisting` passed for package
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`.
- Single-machine smoke passed on dashboard `http://127.0.0.1:3001`, reachable
  URL `http://127.0.0.1:3001/app`, bridge `http://127.0.0.1:2555`, task
  `985b7bae-8a1d-4815-82e8-67202abe7938`, and output
  `MUSU_RELEASE_SMOKE_OK_20260604_185856`.
- Desktop-open CPU passed for `60.063s` with MUSU `0.03`, Node `0`, WebView2
  `0.49`, owned WebView2 `6`, working set `484.19MB`, and hot process count
  `0`.
- Five-state matrix passed verifier `ok=true`, `fail_count=0` for
  `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`, and
  `post-route`; route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_190203`; max CPU MUSU `0.1`, Node
  `0.05`, WebView2 `0.55`; max working set `484.91MB`; route probe ok.
- Clean go/no-go on `5d94c236` reports `local_artifacts_ready=true`,
  `single_machine_verified=true`, `msix_install_verified=true`,
  `msix_desktop_entrypoint_verified=true`, runtime idle CPU
  `1/2 [HUGH_SECOND]`, runtime CPU matrix `1/2 [HUGH_SECOND]`,
  `public_metadata_ok=true`, and `manifest_git.dirty=false`.

## Notes

HUGH_SECOND still has live developer PATH shadowing from
`C:\Users\empty\.cargo\bin\musu.exe`, so fresh warning-mode install output stays
diagnostic-only. Canonical strict MSIX install evidence remains the prior strict
record used by go/no-go.

Public release remains No-Go until the second Windows PC has the same current
MUSU build installed and records multi-device route evidence, runtime idle CPU
evidence, and runtime CPU matrix evidence, plus hosted `musu.pro` P2P
control-plane proof, support mailbox proof, and Store evidence.
