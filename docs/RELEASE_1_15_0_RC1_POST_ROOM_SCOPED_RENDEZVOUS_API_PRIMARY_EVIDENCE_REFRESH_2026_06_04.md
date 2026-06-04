# MUSU 1.15.0-rc.1 Post Room-Scoped Rendezvous API Primary Evidence Refresh

Date: 2026-06-04 18:37 KST

## Summary

After adding `POST /api/rooms/[roomId]/rendezvous`, the local-sideload MSIX was
rebuilt/reinstalled and primary-machine packaged evidence was refreshed on
`HUGH_SECOND`.

This restores the one-machine local evidence for the current room-scoped
rendezvous source while preserving the roadmap boundary: `musu.pro` coordinates
room context and P2P rendezvous, and local MUSU programs execute work on each
device.

## Evidence

- Single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-182640-HUGH_SECOND.evidence.json`
- Desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-182732-HUGH_SECOND.desktop-open.evidence.json`
- Five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-182915-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

## Results

- `install-and-verify-msix.ps1 -StartupContract local-sideload-manual
  -ReplaceExisting` passed for the rebuilt package
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`.
- Single-machine smoke passed on dashboard `http://127.0.0.1:3001`, reachable
  URL `http://127.0.0.1:3001/app`, bridge `http://127.0.0.1:12502`, and output
  `MUSU_RELEASE_SMOKE_OK_20260604_182613`.
- Desktop-open CPU passed for `60.04s` with MUSU `0.13`, Node `0`, WebView2
  `0.68`, owned WebView2 `6`, working set `486.19MB`, and hot process count
  `0`.
- Five-state matrix passed verifier `ok=true`, `fail_count=0` for
  `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`, and
  `post-route`; route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_182915`; max CPU MUSU `0`, Node `0.05`,
  WebView2 `0.31`; max working set `489.12MB`.
- Clean go/no-go on `5fb40731` reports `local_artifacts_ready=true`,
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
