# 2026-06-04 Post Relay Connect/Queue Primary Evidence Refresh

- After relay status was split into release connect endpoint state and preview
  queue state, current-source primary packaged evidence was refreshed on
  `HUGH_SECOND`.
- Strict MSIX install evidence:
  `docs\evidence\msix-install\1.15.0-rc.1\20260604-155606-HUGH_SECOND.evidence.json`
  with `AliasShadowingMode=fail`, first alias
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`, and shadowing
  count `0`.
- Single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-154159-HUGH_SECOND.evidence.json`,
  dashboard `http://127.0.0.1:3001`, bridge `http://127.0.0.1:2817`, task
  `f16d5bb9-eed4-42c9-9b7c-ccda14e68786`, output
  `MUSU_RELEASE_SMOKE_OK_20260604_154129`.
- Desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-154401-HUGH_SECOND.desktop-open.evidence.json`,
  `60.055s`, MUSU `0`, Node `0.05`, WebView2 `1.09`, working set `483.5MB`,
  hot `0`.
- Five-state matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-154626-HUGH_SECOND.runtime-cpu-scenario-matrix.json`,
  route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_154626`, verifier
  `ok=true`, `fail_count=0`.
- Clean go/no-go on `c3d36a7b` reports local artifacts ready, single-machine
  verified, MSIX install verified, runtime idle CPU `1/2 [HUGH_SECOND]`,
  runtime CPU matrix `1/2 [HUGH_SECOND]`, public metadata OK, manifest dirty
  false, and six remaining blockers.
- Product roadmap remains: MUSU.PRO is web input/project room/company meeting
  room/rendezvous/path-selection/relay-fallback/evidence plane; local MUSU
  programs execute work; devices prefer P2P mesh after web-assisted rendezvous.
  Second-PC validation requires installing the current build on another Windows
  machine.
