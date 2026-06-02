# 2026-06-02 10:51 KST - Health Poll Primary Evidence Refresh

wiki/545 records the fresh primary MSIX/evidence refresh after health poll
backoff commit `1990b60b7e0b9f093c62bc48fa9b101a3f035c1b`.

Build/install:

- `run-msix-workflow.ps1 -Configuration release -StartupContract local-sideload-manual -SkipSmoke -AttemptInstall -VerifyInstalled -ReplaceExisting`
- `CARGO_BUILD_JOBS=1`, `CARGO_INCREMENTAL=0`
- Rust release build completed in `16m 06s`
- installed package `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`

Fresh primary evidence:

- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-104113-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-104113-HUGH_SECOND.process-ownership.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-104202-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-104113-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-104331-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Key values:

- CPU evidence: `git_dirty=false`, hot `0`, MUSU `0`, Node `0.03`, WebView2
  `0.18`, working set `501.1MB`.
- Matrix: `git_dirty=false`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_104331`, max WebView2 `0.31`.
- Process ownership: runtime `1`, desktop shell `1`, owned Node `0`, owned
  WebView2 `6`, machine-wide Node `18`.

Status:

- Primary busy-loop is not reproduced after the health-poll backoff change.
- Release remains No-Go until second-PC CPU/matrix/route, live `musu.pro` P2P
  relay lease owner-scope evidence, `musu@musu.pro`, and Store evidence pass.
