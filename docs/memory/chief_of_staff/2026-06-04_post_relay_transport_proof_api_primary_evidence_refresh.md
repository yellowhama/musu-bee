# 2026-06-04 Post Relay Transport Proof API Primary Evidence Refresh

After the relay transport proof record API commit, rebuilt and reinstalled the
local-sideload MSIX as `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`, then
refreshed primary-machine evidence on `HUGH_SECOND`.

Fresh evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-000322-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-000405-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-000535-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verifier:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-000535-HUGH_SECOND.verification.json`

Results:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260604_000259`
- bridge `http://127.0.0.1:3477`
- dashboard task `836ed892-5340-4be4-8f44-ca897c8c5f49`
- desktop-open CPU `60.059s`: MUSU `0.03`, Node `0.03`, WebView2 `0.57`,
  hot `0`, working set `453.71MB`
- five-state matrix route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_000535`
- matrix verifier `ok=true`, `fail_count=0`

Clean go/no-go at `2026-06-04T00:16:47.6824922+09:00` on `049a9a9a`
reports `ready=false`, `local_artifacts_ready=true`, `single_machine=true`,
runtime idle CPU `1/2`, runtime CPU matrix `1/2`, relay route evidence count
`0`, relay payload proof `false`, `manifest_dirty=false`, and six blockers.

Public release remains No-Go on second-PC runtime/multi-device evidence, hosted
P2P relay payload proof, support mailbox evidence, and Store evidence.
