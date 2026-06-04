# 2026-06-05 Post Room Work-Order Auth Primary Evidence Refresh

Restored current primary-machine packaged evidence after room work-order auth
hardening.

Commit under test:

- `aa52b243cb6b1b8350f060516e72c26d730da059`

Evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-004553-HUGH_SECOND.evidence.json`
- single-machine verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-004553-HUGH_SECOND.verification.json`
- single-machine summary:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-004553-HUGH_SECOND.summary.md`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-004657-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-004808-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260605_004448`
- CLI route output contained `MUSU_CLI_ROUTE_OK_20260605_004448`
- desktop-open CPU: MUSU `0`, Node `0`, WebView2 `0.39`, owned WebView2
  `6`, working set `489.86MB`, hot `0`
- matrix route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_004808`
- matrix maxima: MUSU `0.57`, Node `0.08`, WebView2 `0.65`, working set
  `492.2MB`, hot `0`

Roadmap interpretation:

- `musu.pro` is web input/project room/company room/presence/rendezvous/path
  selection/relay fallback/evidence.
- Local MUSU programs execute work on each device.
- Current proof is one-machine only. Second-PC install, route, CPU, matrix, and
  hosted P2P evidence still block public release.

