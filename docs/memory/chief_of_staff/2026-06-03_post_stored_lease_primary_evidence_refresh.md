# 2026-06-03 Post Stored-Lease Primary Evidence Refresh

After commit `ec9db1d29fa350f256ddc6fc9ae8e54ebb2435e5` added the stored relay
lease requirement for release-grade relay route evidence, primary-machine
runtime evidence was refreshed on HUGH_SECOND.

Artifacts:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-120751-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-120903-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-121028-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- canonical report:
  `docs\RELEASE_1_15_0_RC1_POST_STORED_LEASE_PRIMARY_EVIDENCE_REFRESH_2026_06_03.md`

Key numbers:

- smoke task `afb7e08d-427b-4307-bdd5-4d5b165dd026`
- smoke output `MUSU_RELEASE_SMOKE_OK_20260603_120729`
- idle CPU `desktop-open`: MUSU `0`, Node `0.05`, WebView2 `0.08`,
  hot `0`, working set `496.49MB`
- matrix route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_121028`
- matrix includes `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`, and `post-route`, all clean and under the 5% one-core budget

Release interpretation:

- current primary-machine smoke/CPU/matrix evidence is restored for commit
  `ec9db1d29fa350f256ddc6fc9ae8e54ebb2435e5`
- public release still needs second-PC runtime evidence, hosted P2P relay
  payload proof, support mailbox evidence, and Store evidence
