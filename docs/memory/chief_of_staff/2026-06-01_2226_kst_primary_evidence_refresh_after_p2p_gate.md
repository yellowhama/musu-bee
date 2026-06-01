# 2026-06-01 22:26 KST - Primary Evidence Refresh After P2P Gate

After the live P2P control-plane gate commit reset primary evidence freshness,
I refreshed primary Windows evidence on `HUGH_SECOND`.

Evidence:

- Single-machine:
  `docs/evidence/single-machine/1.15.0-rc.1/20260601-221225-HUGH_SECOND.evidence.json`
- Desktop-open CPU:
  `docs/evidence/runtime-idle-cpu/1.15.0-rc.1/20260601-221918-HUGH_SECOND.desktop-open.evidence.json`
- Runtime CPU matrix:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.1/20260601-222043-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- Single-machine smoke passed with dashboard task
  `927874c7-ce4d-4eb1-a84d-1bd7517ff844`, bridge
  `http://127.0.0.1:4752`, and CLI route checked.
- Production-dashboard desktop-open CPU passed from clean commit
  `bcfdbf3222166aca05bf3196184311180375c5f9`: MUSU `2`, repo Node `1`,
  owned WebView2 `6`, max one-core CPU `musu=0`, `node=0`,
  `webview2=0.13`, working set `469.28MB`, no hot processes.
- Runtime CPU matrix passed from clean commit
  `278372551f12f54816db9a0f47e677e2ac0125da`: `runtime-started`,
  `dashboard-open`, `desktop-open`, and `post-route` all passed 60s samples.
  Route token was `MUSU_CPU_SCENARIO_ROUTE_OK_20260601_222043`.
- Clean go/no-go on `5b8650f084a0df9cf5cabde77af31dd11b366c0a` reports
  `single_machine=true`, runtime idle CPU `1/2`, runtime CPU scenario matrix
  `1/2`, `manifest_dirty=false`, and `ready=false`.

Remaining blockers:

- second-PC desktop-open CPU evidence
- second-PC runtime CPU matrix
- release-grade multi-device route evidence
- support mailbox evidence
- Store release evidence
- live `musu.pro` P2P control-plane auth
