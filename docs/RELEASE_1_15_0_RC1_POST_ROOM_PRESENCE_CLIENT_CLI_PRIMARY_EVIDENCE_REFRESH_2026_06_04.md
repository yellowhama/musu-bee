# MUSU 1.15.0-rc.1 Post Room Presence Client CLI Primary Evidence Refresh

Date: 2026-06-04 20:52 KST

## Summary

Fresh primary-machine packaged evidence was restored after adding the local
room presence client CLI.

The current source now includes:

- `musu room presence publish <room-id>`
- `musu room presence list <room-id>`

The current primary-machine evidence again proves the packaged local operator
path after that Rust runtime source change.

## Evidence

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-204006-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-204236-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-204423-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

## Results

- Rebuilt local-sideload MSIX:
  `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`.
- `install-and-verify-msix.ps1 -StartupContract local-sideload-manual
  -ReplaceExisting` passed. HUGH_SECOND still has a developer PATH warning
  because `.cargo\bin\musu.exe` resolves before the WindowsApps alias, so no
  new strict MSIX install evidence was recorded from that warning-mode state.
- Smoke passed with dashboard `http://127.0.0.1:3001`, reachable URL
  `http://127.0.0.1:3001/app`, bridge `http://127.0.0.1:11853`, dashboard task
  `5c2b5865-e468-4cd0-891a-160ca56600a2`, output
  `MUSU_RELEASE_SMOKE_OK_20260604_203939`, and CLI route output
  `MUSU_CLI_ROUTE_OK_20260604_203939`.
- Desktop-open CPU passed for `60.012s` from clean git state with MUSU `0`,
  Node `0`, WebView2 `0`, working set `46.55MB`, and hot process count `0`.
- Five-state matrix passed verifier `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_204423`, and hot process count `0`
  across required scenarios.
- Clean go/no-go generated at `2026-06-04T20:51:42+09:00` on commit
  `75348c74` reported `local_artifacts_ready=true`,
  `single_machine_verified=true`, `msix_install_verified=true`,
  `msix_desktop_entrypoint_verified=true`, `manifest_git.dirty=false`, and
  public desktop release No-Go.

## Release Note

Primary-machine evidence is current again for the room presence client CLI
source. Public release remains blocked until second-PC runtime/multi-device
evidence, hosted `musu.pro` P2P control-plane proof, `musu@musu.pro` mailbox
evidence, and Store evidence are complete.

The roadmap boundary remains unchanged: `musu.pro` is remote input, project
room, company meeting room, presence, rendezvous, path-selection,
relay-fallback coordination, and evidence. Local MUSU programs execute work on
each device and prefer P2P mesh after web-assisted rendezvous.
