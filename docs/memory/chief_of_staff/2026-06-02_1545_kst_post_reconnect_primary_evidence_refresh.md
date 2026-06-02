# 2026-06-02 15:45 KST - Post-reconnect primary evidence refresh

Fresh current-head primary MSIX/runtime evidence was restored after the runtime
reconnect backoff hardening and post-push status.

Evidence summary:

- MSIX package rebuilt:
  `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- packaged runtime bridge:
  `http://127.0.0.1:14397`
- dashboard evidence URL:
  `http://127.0.0.1:3001/app`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-152526-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-152537-HUGH_SECOND.process-ownership.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-152615-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-152845-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU scenario matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-153038-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Important observations:

- Use the explicit WindowsApps alias for packaged evidence because
  `C:\Users\empty\.cargo\bin\musu.exe` still shadows the packaged alias on the
  local PATH.
- The `-MachineTrust` install wrapper waited for elevation and was stopped only
  after existing trust made it unnecessary; current-user reinstall then passed.
- Process ownership passed with runtime `1`, desktop `1`, owned Node `0`,
  owned WebView2 `6`, machine-wide Node `18`, machine-wide WebView2 `12`, and
  orphan repo helpers `0`.
- Desktop-open CPU sampled 60.061s with MUSU `0`, repo Node `0.05`, WebView2
  `0.13`, working set `500.86MB`, and hot `0`.
- Four-state matrix passed `runtime-started`, `dashboard-open`, `desktop-open`,
  and `post-route`; route token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_153038`.

Qualitative status:

- The operator-reported 20%-of-one-core busy-loop is not reproduced by current
  packaged primary evidence.
- Current local desktop/MSIX beta readiness is materially improved, but public
  release remains No-Go.
- Remaining release blockers are second-PC CPU/matrix/route evidence, live
  `musu.pro` P2P owner-scope evidence, `musu@musu.pro` mailbox evidence, and
  Store evidence.
