# 2026-06-03 Post Transport Descriptor Primary Evidence Refresh

After adding and deploying the P2P relay transport descriptor/preflight gate,
primary-machine release evidence was refreshed on HUGH_SECOND.

Artifacts:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-131556-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-131811-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-131938-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- canonical report:
  `docs\RELEASE_1_15_0_RC1_POST_TRANSPORT_DESCRIPTOR_PRIMARY_EVIDENCE_REFRESH_2026_06_03.md`

Key numbers:

- smoke task `bba38031-b333-4b86-af61-64b65187a82b`
- smoke output `MUSU_RELEASE_SMOKE_OK_20260603_131531`
- idle CPU `desktop-open`: MUSU `0`, Node `0.05`, WebView2 `0.31`,
  hot `0`, working set `497.94MB`
- matrix route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_131938`
- matrix includes `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`, and `post-route`, all clean and under the 5% one-core budget

Release interpretation:

- current primary-machine smoke/CPU/matrix evidence is restored after the P2P
  relay transport descriptor gate
- clean go/no-go on `2fe8d220` reports single-machine true, runtime idle CPU
  `1/2`, runtime CPU matrix `1/2`, P2P control plane false, relay route count
  `0`, relay payload proof false, and git dirty false
- public release still needs second-PC runtime evidence, hosted P2P relay
  payload proof, support mailbox evidence, and Store evidence
