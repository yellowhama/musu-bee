# 2026-06-07 Current-Head CPU Matrix After P2P Env Root Readiness

Fresh packaged runtime CPU matrix evidence was captured on `HUGH_SECOND` after
the P2P env root readiness JSON update.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_HEAD_CPU_MATRIX_AFTER_P2P_ENV_ROOT_READINESS_2026_06_07.md`

Evidence:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-165333-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-165333-HUGH_SECOND.runtime-cpu-scenario-matrix.verification.json`

Result:

- `ok=true`
- `fail_count=0`
- `git_commit=eb7f58231547d73d8f011a3fbbebca90d585f1e9`
- `git_dirty=false`
- `musu_exe_release_identity=true`
- hot process count `0`
- MUSU CPU `0`
- Node CPU `0`
- owned WebView2 max `0.10`
- owned process count `8`
- owned WebView2 helper count `6`
- max working set `370.51MB`
- route target `PRIMARY-PC`
- route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260607_165333`
- route probe failed with `peer 'PRIMARY-PC' not found`, and failure was
  explicitly allowed for this target-route CPU diagnostic.

Release meaning:

- current HEAD remains locally under runtime resource budget on one machine;
- this is not successful multi-device route proof;
- public release remains No-Go until second-machine CPU/matrix, real
  multi-device route evidence, live MUSU.PRO relay proof, support mailbox
  proof, and Store proof pass.

Search terms should include `GOAL v825`, `wiki/1000`,
`20260607-165333-HUGH_SECOND`, `eb7f5823`, `WebView2 max 0.10`,
`MUSU_CPU_SCENARIO_ROUTE_OK_20260607_165333`, and
`PRIMARY-PC peer not found`.
