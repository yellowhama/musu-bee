# 2026-06-03 Post Relay Connect Primary Evidence Refresh

After commit `e592bf608341f0461b03d55c7c0845ccf7781be0`, current-HEAD
local-sideload MSIX was rebuilt and reinstalled as
`Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`.

Evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-195528-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-195742-HUGH_SECOND.desktop-open.evidence.json`
- runtime matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-195917-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260603_195506`
- bridge `http://127.0.0.1:10502`
- desktop-open CPU `60.059s`: MUSU `0`, Node `0`, WebView2 `0.39`,
  working set `521.48MB`
- matrix verifier `ok=true`, `fail_count=0`
- matrix route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_195917`
- matrix max CPU: MUSU `0.42`, Node `0.05`, WebView2 `0.42`
- matrix max working set `527.72MB`

Public release remains No-Go on second-PC runtime/multi-device evidence, hosted
relay payload proof, support mailbox evidence, and Store evidence.
