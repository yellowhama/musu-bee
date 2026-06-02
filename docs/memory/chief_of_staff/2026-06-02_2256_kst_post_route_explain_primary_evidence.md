# 2026-06-02 22:56 KST Post Route Explain Primary Evidence

- After route-explain trust-boundary hardening commit
  `9302589745165c56010773a30bb5d5fa2c778cca`, the local-sideload MSIX was
  rebuilt and installed as `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`.
- Fresh primary evidence passed:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-224345-HUGH_SECOND.evidence.json`,
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-223734-HUGH_SECOND.desktop-single-instance.json`,
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-223756-HUGH_SECOND.process-ownership.json`,
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-223806-HUGH_SECOND.desktop-open.evidence.json`,
  and
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-224917-HUGH_SECOND.runtime-cpu-scenario-matrix.json`.
- Desktop-open CPU: MUSU `0`, Node `0`, WebView2 `0.39`, working set
  `365.49MB`, private memory `187.6MB`, hot `0`.
- Process ownership: runtime `1`, desktop `1`, MUSU-owned Node `0`,
  MUSU-owned WebView2 `6`, machine-wide Node `16`, orphan repo helpers `0`,
  bridge `127.0.0.1:2785` HTTP `200`.
- Runtime matrix passed from clean git state with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_224917`; all four scenarios stayed
  below the 5 percent one-core budget.
- Qualitative verdict: busy-loop is not reproduced on current packaged
  primary evidence, and route explain no longer overstates identity/encryption.
  Public release is still No-Go on second-PC route/CPU/matrix, live P2P
  KV/owner scope, `musu@musu.pro` support mailbox evidence, and Store evidence.
