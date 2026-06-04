# 2026-06-04 Post Work-Order Context Primary Evidence Refresh

Fresh primary-machine packaged evidence was restored after MUSU.PRO work-order
context hardening.

Committed evidence:

- MSIX install:
  `docs\evidence\msix-install\1.15.0-rc.1\20260604-164153-HUGH_SECOND.evidence.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-164313-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-164620-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-164933-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- strict MSIX evidence passed with WindowsApps alias first and alias shadowing
  accepted `false`
- single-machine smoke passed at dashboard `http://127.0.0.1:3001`, reachable
  URL `http://127.0.0.1:3001/app`, bridge `http://127.0.0.1:11480`, and output
  `MUSU_RELEASE_SMOKE_OK_20260604_164246`
- desktop-open CPU passed for `60.065s` with MUSU `0`, Node `0`, WebView2
  `0.18`, owned WebView2 `6`, working set `466.49MB`, hot `0`
- five-state CPU matrix passed verifier `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_164933`, max CPU MUSU `0.03`, Node
  `0.03`, WebView2 `0.18`, max working set `470.97MB`, hot `0`
- clean go/no-go on `d8e91f0f` reports local artifacts/MSIX/single-machine
  true, runtime idle CPU `1/2 [HUGH_SECOND]`, runtime CPU matrix
  `1/2 [HUGH_SECOND]`, public metadata true, manifest clean, and public release
  No-Go on six unchanged blockers

Roadmap lock remains: `musu.pro` is web input/project room/company meeting
room/rendezvous/path-selection/relay-fallback/evidence plane; local MUSU
programs execute work and prefer P2P mesh after web-assisted rendezvous.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_WORK_ORDER_CONTEXT_PRIMARY_EVIDENCE_REFRESH_2026_06_04.md`
