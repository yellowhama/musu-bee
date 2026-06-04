# 2026-06-04 Post Room Event API Primary Evidence Refresh

- Rebuilt and reinstalled the local-sideload MSIX after the room event API
  source change.
- Recorded single-machine smoke
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-185920-HUGH_SECOND.evidence.json`
  with output `MUSU_RELEASE_SMOKE_OK_20260604_185856`.
- Recorded desktop-open CPU
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-190029-HUGH_SECOND.desktop-open.evidence.json`:
  `60.063s`, MUSU `0.03`, Node `0`, WebView2 `0.49`, working set
  `484.19MB`, hot `0`.
- Recorded runtime CPU matrix
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-190203-HUGH_SECOND.runtime-cpu-scenario-matrix.json`:
  verifier `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_190203`, max CPU MUSU `0.1`, Node
  `0.05`, WebView2 `0.55`, max working set `484.91MB`.
- Clean go/no-go on `5d94c236` reports local artifacts ready and
  single-machine verified; public release remains No-Go on second-PC,
  hosted P2P, support mailbox, and Store evidence gates.
