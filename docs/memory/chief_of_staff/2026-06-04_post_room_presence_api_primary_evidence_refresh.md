# 2026-06-04 Post Room Presence API Primary Evidence Refresh

- Rebuilt and reinstalled the local-sideload MSIX after the room presence API
  source change.
- Recorded single-machine smoke
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-193251-HUGH_SECOND.evidence.json`
  with output `MUSU_RELEASE_SMOKE_OK_20260604_193224`.
- Recorded desktop-open CPU
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-193347-HUGH_SECOND.desktop-open.evidence.json`:
  `60.162s`, MUSU `0`, Node `0.05`, WebView2 `0.78`, working set
  `482.9MB`, hot `0`.
- Recorded runtime CPU matrix
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-193512-HUGH_SECOND.runtime-cpu-scenario-matrix.json`:
  verifier `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_193512`, max CPU MUSU `0.03`, Node
  `0.03`, WebView2 `0.34`, max working set `483.64MB`.
- Clean go/no-go on `8e1dc11` reports local artifacts ready and
  single-machine verified; public release remains No-Go on second-PC,
  hosted P2P, support mailbox, and Store evidence gates.
- Roadmap remains: `musu.pro` handles remote user input, project/company rooms,
  presence, rendezvous, path selection, relay fallback, and evidence; local
  MUSU programs execute work on each device and use P2P mesh after
  web-assisted rendezvous.
