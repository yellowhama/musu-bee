# 2026-06-02 08:40 KST - Frontend polling primary evidence refresh

- After `taskTimeoutMs` frontend polling hardening, a fresh
  `local-sideload-manual` MSIX was built/installed for
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`.
- Clean source commit for the runtime samples:
  `22ba6c313dea4dd32ae43a46dca424b3443edf85`.
- Desktop single-instance evidence passed:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-0832-HUGH_SECOND.desktop-single-instance.json`.
- Process ownership evidence passed:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-0832-HUGH_SECOND.process-ownership.json`
  with one runtime, one desktop shell, owned Node `0`, owned WebView2 `6`,
  bridge PID `14556`, and health HTTP 200 at `127.0.0.1:9967`.
- Single-machine smoke passed:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-083131-HUGH_SECOND.evidence.json`,
  dashboard task `4ae56776-f54d-4955-98cb-d6774626d072`, bridge
  `http://127.0.0.1:9967`, output `MUSU_RELEASE_SMOKE_OK_20260602_083131`,
  CLI route checked.
- Desktop-open CPU evidence passed:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-0833-HUGH_SECOND.desktop-open.evidence.json`,
  MUSU `2`, repo Node `1`, owned WebView2 `6`, max one-core CPU `musu=0`,
  `node=0.08`, `webview2=0.34`, hot `0`.
- Four-state CPU matrix passed:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-083314-HUGH_SECOND.runtime-cpu-scenario-matrix.json`,
  route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_083314`.
- Interpretation: current primary busy-loop is not reproduced in MUSU-owned
  packaged evidence. Release remains No-Go until second-PC CPU/matrix/route,
  live `musu.pro` P2P KV/control-plane, `musu@musu.pro`, and Store evidence
  pass.
- Operator caveat: `C:\Users\empty\.cargo\bin\musu.exe` still shadows the
  WindowsApps alias in the dev shell; final packaged CLI checks should use the
  explicit WindowsApps alias or remove the stale dev alias.
