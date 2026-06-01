# 2026-06-01 19:50 KST - Primary Smoke And CPU Evidence Refresh

Context:

- Commit `e1f42be0` documented that the hardware-probe hardening commit invalidated earlier primary smoke/CPU evidence by source freshness.
- The next required step was to refresh primary evidence before asking second-PC evidence to close the two-machine gates.

Actions:

- Started the dashboard with `npm run start` / `next start -p 3001`.
- Ran `musu up --json`, which started a healthy bridge at `http://127.0.0.1:4752`.
- Ran `smoke-single-machine-beta.ps1 -DashboardBaseUrl http://127.0.0.1:3001`.
- Recorded single-machine evidence with `record-single-machine-evidence.ps1`.
- Ran packaged `desktop-open` idle CPU evidence from clean git state.
- Ran the 4-state runtime CPU matrix from clean git state with route probe.

Evidence:

- Single-machine: `docs/evidence/single-machine/1.15.0-rc.1/20260601-194130-HUGH_SECOND.evidence.json`
  - dashboard task `60cb73e5-ea3c-42c8-bcd6-41f09e618a16`
  - bridge `http://127.0.0.1:4752`
  - CLI route checked
- Runtime idle CPU: `docs/evidence/runtime-idle-cpu/1.15.0-rc.1/20260601-194410-HUGH_SECOND.desktop-open.evidence.json`
  - source commit `42cf892e41517f6c6d3a1066c6b0b4609a59f907`
  - `git_dirty=false`
  - 60.056s sample
  - process counts: MUSU `2`, repo Node `1`, owned WebView2 `6`
  - max one-core CPU: `musu=0`, `node=0.03`, `webview2=0.08`
  - working set `506.72MB`, private memory `328.53MB`
  - no resource budget violations
- Runtime CPU matrix: `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.1/20260601-194528-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  - `runtime-started`, `dashboard-open`, `desktop-open`, and `post-route` all passed
  - route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260601_194528`

Go/no-go:

- `single_machine_verified=true`
- runtime idle CPU is back to `1/2` with `HUGH_SECOND`
- runtime CPU scenario matrix is back to `1/2`
- public metadata and MSIX install remain ok
- public release remains No-Go: second-PC CPU/matrix evidence, release-grade multi-device route proof, `musu@musu.pro` inbox evidence, Store evidence, and production P2P control env verification remain open.
