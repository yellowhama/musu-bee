# 2026-06-03 Post Status JSON Primary Evidence

After `musu status --json` hardening, the local-sideload MSIX was rebuilt and
installed from packaged source commit `e2727025`. Current primary packaged
evidence is restored.

Evidence:

- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260603-021134-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260603-021134-HUGH_SECOND.process-ownership.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-021321-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-021134-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-021552-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Qualitative result: the reported busy-loop is not reproduced on HUGH_SECOND.
Desktop-open CPU reports MUSU `0`, Node `0`, WebView2 `0.13`, working set
`367.91MB`, and hot process count `0`. Process ownership reports runtime `1`,
desktop `1`, MUSU-owned Node `0`, owned WebView2 `6`, machine-wide Node `16`,
and orphan repo helpers `0`. Matrix route token is
`MUSU_CPU_SCENARIO_ROUTE_OK_20260603_021552`.

Clean go/no-go on manifest commit `043999d8` remains public No-Go:
`local_artifacts_ready=true`, `single_machine_verified=true`, runtime idle CPU
valid machines `1/2 [HUGH_SECOND]`, runtime CPU matrix valid machines
`1/2 [HUGH_SECOND]`, while multi-device, P2P control-plane, support mailbox,
and Store gates remain false.
