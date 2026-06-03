# 2026-06-03 Startup-Open CPU Matrix Gate

- `measure-musu-runtime-cpu-scenarios.ps1` now release-gates five scenarios:
  `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`, and
  `post-route`.
- `startup-open` must launch the packaged desktop app and begin sampling within
  3s; `verify-runtime-cpu-scenario-matrix.ps1` rejects no-op startup entries.
- `write-release-go-no-go.ps1`, the second-PC wrapper, final operator packet,
  multi-device kit, handoff status, and release verifier fixture now use the
  five-scenario matrix.
- Primary five-scenario matrix evidence
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-105650-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  passed from clean commit `2defe28d9ff107813f476ae22720e2d715894f9e` with
  route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_105650`.
- CPU summary: startup-open WebView2 `1.51`, runtime-started WebView2 `0.21`,
  dashboard-open WebView2 `0.16`, desktop-open WebView2 `0.03`, post-route
  WebView2 `0.05`, all hot `0`.
- Dirty-tree go/no-go after adding evidence reports `single_machine_verified=true`,
  runtime idle CPU `1/2`, runtime CPU matrix `1/2`, and remaining blockers on
  second-PC, support mailbox, Store, and hosted P2P relay proof.

