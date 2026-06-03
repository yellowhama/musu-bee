# 2026-06-03 Post Relay Transport Proof Primary Evidence Refresh

After adding the relay transport proof gate, primary-machine release evidence
was refreshed on HUGH_SECOND.

Artifacts:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-141358-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-141524-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-141712-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- canonical report:
  `docs\RELEASE_1_15_0_RC1_POST_RELAY_TRANSPORT_PROOF_PRIMARY_EVIDENCE_REFRESH_2026_06_03.md`

Key numbers:

- smoke task `3e8522a2-73ef-4b51-bb3c-bb0b6bc251af`
- smoke output `MUSU_RELEASE_SMOKE_OK_20260603_141331`
- idle CPU `desktop-open`: MUSU `0`, Node `0.03`, WebView2 `0.44`,
  hot `0`, working set `517.83MB`
- matrix route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_141712`
- matrix includes `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`, and `post-route`, all clean and under the 5% one-core budget

Release interpretation:

- current primary-machine smoke/CPU/matrix evidence is restored after the
  relay transport proof gate
- clean go/no-go on `2445c3bb` reports single-machine true, runtime idle CPU
  `1/2`, runtime CPU matrix `1/2`, P2P control plane false, relay route count
  `0`, relay payload proof false, and git dirty false
- public release still needs second-PC runtime evidence, hosted P2P relay
  payload proof with `musu.relay_transport_proof.v1`, support mailbox
  evidence, and Store evidence
