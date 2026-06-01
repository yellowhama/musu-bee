# 2026-06-01 23:45 KST - Current evidence, code audit, and roadmap

The public-site scroll/logo/emerald accent work is deployed to `musu.pro`.
Commit `b08ed746` passed GitHub `Tests` run `26759256487`, `E2E Tests -
musu-bee` run `26759256574`, and Vercel production deploy run `26759256616`.
Live QA passed for `/`, `/landing`, `/pricing`, and `/install` across
desktop/mobile with actual scroll movement, no horizontal overflow,
favicon-header logo, and `#24C8DB` emerald accent.

Primary evidence was refreshed again after that source change:

- Single-machine:
  `docs/evidence/single-machine/1.15.0-rc.1/20260601-231612-HUGH_SECOND.evidence.json`
- Desktop-open CPU:
  `docs/evidence/runtime-idle-cpu/1.15.0-rc.1/20260601-231939-HUGH_SECOND.desktop-open.evidence.json`
- Runtime CPU matrix:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.1/20260601-233638-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- Single-machine smoke passed with dashboard task
  `900260dc-d0d1-4ac6-9503-0001b4a2f451`, bridge `http://127.0.0.1:4752`,
  dashboard output `MUSU_RELEASE_SMOKE_OK_20260601_231552`, and CLI route
  checked.
- Desktop-open CPU passed from clean source commit `afd1ceab`: MUSU `2`, repo
  Node `1`, owned WebView2 `6`, max one-core CPU `musu=0`, `node=0`,
  `webview2=0.1`, working set `510.13MB`, and no hot processes.
- Runtime CPU matrix passed from clean source commit `5434b4ca`: all four
  scenarios ran 60s with `git_dirty=false`, dashboard URL
  `http://127.0.0.1:3001/app` launched, post-route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260601_233638`, and verifier `ok=true`.

Code-audit conclusion:

- The reported 20%-of-one-core busy-loop is not reproduced in current primary
  samples.
- The many machine-wide Node processes are mostly Codex/MCP/npx helpers. The
  one repo-related Node in release evidence is the test-only Next dashboard on
  port `3001`; MUSU-owned Node remains zero in process ownership audits.
- Desktop shell duplicate-window reactivation remains a product hardening item.
- Production P2P control-plane auth remains a live `musu.pro` env blocker:
  current recorded evidence fails with `p2p_control_auth_not_configured`.

Release remains No-Go until second-PC CPU/matrix evidence, release-grade
multi-device route proof, live P2P control-plane auth, `musu@musu.pro` inbox
evidence, and Store/Partner Center evidence are recorded.

Indexer:

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed 1217 files and 2213 symbols after this evidence/doc refresh.

Post-doc go/no-go:

- Clean go/no-go on commit `278ee8c9b451ba21c23c48fa262d45f505047b79`
  reports `ready=false`, `single_machine=true`, runtime idle CPU `1/2`,
  runtime CPU scenario matrix `1/2`, public metadata true, MSIX install true,
  MSIX desktop entrypoint true, `manifest_dirty=false`, and blockers:
  `multi-device`, `runtime-idle-cpu`, `runtime-cpu-scenario-matrix`,
  `support-mailbox`, `store-release`, and `p2p-control-plane`.
