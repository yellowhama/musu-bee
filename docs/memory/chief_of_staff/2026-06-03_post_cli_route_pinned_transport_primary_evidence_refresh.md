# 2026-06-03 Post CLI Route Pinned Transport Primary Evidence Refresh

Date: 2026-06-03 19:23 KST

Commit:
`dded9eba67415cfdfd371f9c940fa2d59bd366ac`

Fresh primary-machine evidence was restored after CLI route pinned transport
evidence hardening:

- rebuilt release local-sideload MSIX
- installed `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- recorded single-machine smoke
  `20260603-190139-HUGH_SECOND.evidence.json`
- recorded desktop-open CPU
  `20260603-190450-HUGH_SECOND.desktop-open.evidence.json`
- recorded five-state runtime CPU matrix
  `20260603-191447-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260603_190107`
- CLI route output contained `MUSU_CLI_ROUTE_OK_20260603_190107`
- desktop-open CPU: MUSU `0`, Node `0`, WebView2 `0.08`, working set
  `466.26MB`, hot `0`
- accepted matrix: verifier `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_191447`, dashboard URL
  `http://127.0.0.1:3001/app`, max MUSU `0`, Node `0.03`, WebView2 `0.10`,
  working set `595.78MB`

Release state:

- primary local evidence restored to `1/2` for idle CPU and runtime matrix
- public release remains No-Go on second-PC runtime/multi-device evidence,
  hosted P2P relay payload proof, support mailbox evidence, and Store evidence
