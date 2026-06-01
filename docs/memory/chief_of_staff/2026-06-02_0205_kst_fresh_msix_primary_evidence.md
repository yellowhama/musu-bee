# 2026-06-02 02:05 KST - Fresh MSIX primary evidence

- Fresh release MSIX build/install succeeded on `HUGH_SECOND` from commit `2e97d135538f063252577c49762f8018bc366843` with `CARGO_BUILD_JOBS=1`.
- Installed package: `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`; AppUserModelId: `Yellowhama.MUSU_ygcjq669as2b6!MUSU`.
- Desktop repeated activation now passes in the installed package: evidence `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-014803-HUGH_SECOND.evidence.json`, repeat count `3`, baseline `0`, after `1`, new shell count `1`, PID `32232`.
- Single-machine smoke passes: `docs\evidence\single-machine\1.15.0-rc.1\20260602-015347-HUGH_SECOND.evidence.json`, task `3e96b141-6aa5-4d39-a29b-450f15eed8b3`, bridge `http://127.0.0.1:6907`, output `MUSU_RELEASE_SMOKE_OK_20260602_015326`.
- Desktop-open CPU passes: `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-015358-HUGH_SECOND.desktop-open.evidence.json`, 60.055s, MUSU `2`, hot process count `0`, max one-core CPU `musu=0.03`, `node=0.68`, `webview2=0.7`, working set `537.79MB`.
- Four-state CPU matrix passes: `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-015510-HUGH_SECOND.runtime-cpu-scenario-matrix.json`, route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_015510`.
- Process ownership passes: `docs\evidence\process-ownership\1.15.0-rc.1\20260602-020031-HUGH_SECOND.evidence.json`, runtime `1`, desktop shell `1`, owned Node `0`, owned WebView2 `6`, machine-wide Node `18`, orphan repo helpers `0`, bridge health HTTP 200.
- Manual direct PowerShell piping of packaged `musu up --json` hung during diagnostics; smoke/matrix harnesses avoid this through temp-file capture. Keep this as a hardening item, not a closed issue.
- Public release remains No-Go: second-PC CPU/matrix, release-grade multi-device route, live `musu.pro` P2P control-plane auth, `musu@musu.pro`, and Store/Partner Center evidence are still missing.
