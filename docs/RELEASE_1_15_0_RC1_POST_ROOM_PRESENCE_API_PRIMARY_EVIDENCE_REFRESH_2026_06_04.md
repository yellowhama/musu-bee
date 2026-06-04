# MUSU 1.15.0-rc.1 Post Room Presence API Primary Evidence Refresh

Date: 2026-06-04 19:45 KST

## Summary

After adding `POST /api/rooms/[roomId]/presence` and
`GET /api/rooms/[roomId]/presence`, the local-sideload MSIX was rebuilt and
reinstalled, then primary-machine packaged evidence was refreshed on
`HUGH_SECOND`.

This restores the one-machine local evidence for the current room presence
source. The product boundary remains locked: `musu.pro` is the remote user
input, project room, company meeting room, presence, rendezvous, path
selection, relay fallback, and evidence plane; local MUSU programs execute work
on each device and prefer direct P2P mesh routes after web-assisted rendezvous.

## Evidence

- Single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-193251-HUGH_SECOND.evidence.json`
- Desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-193347-HUGH_SECOND.desktop-open.evidence.json`
- Five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-193512-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

## Results

- `build-msix.ps1 -StartupContract local-sideload-manual` produced
  `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`.
- `install-and-verify-msix.ps1 -StartupContract local-sideload-manual
  -ReplaceExisting` passed for package
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`.
- Single-machine smoke passed on dashboard `http://127.0.0.1:3001`, reachable
  URL `http://127.0.0.1:3001/app`, bridge `http://127.0.0.1:10358`, task
  `fcd02b2e-1516-4eae-b839-4758fe971bdd`, and output
  `MUSU_RELEASE_SMOKE_OK_20260604_193224`.
- Desktop-open CPU passed for `60.162s` with MUSU `0`, Node `0.05`, WebView2
  `0.78`, owned WebView2 `6`, working set `482.9MB`, and hot process count
  `0`.
- Five-state matrix passed verifier `ok=true`, `fail_count=0` for
  `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`, and
  `post-route`; route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_193512`; route probe ok.
- Matrix max CPU stayed under budget: MUSU `0.03`, Node `0.03`, WebView2
  `0.34`; max working set `483.64MB`; every scenario recorded hot process
  count `0`.
- Clean go/no-go on `8e1dc11` reports `local_artifacts_ready=true`,
  `single_machine_verified=true`, `msix_install_verified=true`,
  `msix_desktop_entrypoint_verified=true`, runtime idle CPU
  `1/2 [HUGH_SECOND]`, runtime CPU matrix `1/2 [HUGH_SECOND]`,
  `public_metadata_ok=true`, and `manifest_git.dirty=false`.

## Notes

HUGH_SECOND still has live developer PATH shadowing from
`C:\Users\empty\.cargo\bin\musu.exe`, so warning-mode install output remains
diagnostic-only. The WindowsApps alias exists and is invoked explicitly for
packaged smoke and CPU evidence.

Public release remains No-Go until the same current MUSU build is installed on
a second Windows PC and records multi-device route evidence, runtime idle CPU
evidence, and runtime CPU matrix evidence, plus hosted `musu.pro` P2P
control-plane proof, support mailbox proof, and Store evidence.
