# 2026-06-04 Post Room-Scoped Rendezvous API Primary Evidence Refresh

- Rebuilt/reinstalled local-sideload MSIX after `POST /api/rooms/[roomId]/rendezvous`.
- Single-machine smoke passed:
  `20260604-182640-HUGH_SECOND.evidence.json`, dashboard
  `http://127.0.0.1:3001`, bridge `http://127.0.0.1:12502`, output
  `MUSU_RELEASE_SMOKE_OK_20260604_182613`.
- Desktop-open CPU passed:
  `20260604-182732-HUGH_SECOND.desktop-open.evidence.json`, MUSU `0.13`,
  Node `0`, WebView2 `0.68`, owned WebView2 `6`, working set `486.19MB`, hot
  `0`.
- Five-state matrix passed:
  `20260604-182915-HUGH_SECOND.runtime-cpu-scenario-matrix.json`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_182915`, verifier `ok=true`,
  `fail_count=0`.
- Clean go/no-go on `5fb40731`: local artifacts ready, single-machine verified,
  runtime idle CPU `1/2 [HUGH_SECOND]`, runtime CPU matrix
  `1/2 [HUGH_SECOND]`, public release still No-Go.
- Remaining blockers: current-build second-PC multi-device/CPU/matrix evidence,
  hosted `musu.pro` P2P control-plane proof, support mailbox proof, and Store
  evidence.
