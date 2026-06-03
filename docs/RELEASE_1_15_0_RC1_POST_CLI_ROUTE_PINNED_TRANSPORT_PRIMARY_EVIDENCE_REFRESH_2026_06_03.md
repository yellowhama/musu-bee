# 1.15.0-rc.1 Post CLI Route Pinned Transport Primary Evidence Refresh

Date: 2026-06-03 19:23 KST

Current commit:
`dded9eba67415cfdfd371f9c940fa2d59bd366ac`

## Summary

Fresh primary-machine packaged evidence was restored after CLI route pinned
transport evidence hardening and bounded SSE visibility cleanup.

The local-sideload MSIX was rebuilt in release mode, signed with the existing
trusted `Yellowhama.MUSU` certificate, installed as
`Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`, and verified through the
WindowsApps alias. The package contract remains `local-sideload-manual`.

## Evidence

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-190139-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-190450-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-191447-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

## Results

Single-machine smoke passed with dashboard output
`MUSU_RELEASE_SMOKE_OK_20260603_190107`, CLI route output containing
`MUSU_CLI_ROUTE_OK_20260603_190107`, bridge `http://127.0.0.1:6719`, and
dashboard task `f95befcb-00c3-4430-b3d9-f31dfcef50df`.

Desktop-open CPU passed for `60.064s` with MUSU `0`, Node `0`, WebView2
`0.08`, hot process count `0`, owned process counts MUSU `2`, Node `0`,
WebView2 `6`, total working set `466.26MB`, and private memory `261.25MB`.

The first matrix attempt proved CPU budgets but failed verifier because
`dashboard-open` did not launch a dashboard URL after the dev server was stopped
to avoid measurement pollution. A current production Next build was then
started on `http://127.0.0.1:3001/app`, and the accepted five-state matrix
passed with verifier `ok=true`, `fail_count=0`, route token
`MUSU_CPU_SCENARIO_ROUTE_OK_20260603_191447`, max MUSU `0`, Node `0.03`,
WebView2 `0.10`, and max working set `595.78MB`.

Dirty-tree go/no-go after copying evidence into docs reports local artifacts
`true`, single-machine `true`, runtime idle CPU valid machines `1`, runtime CPU
matrix valid machines `1`, P2P control plane `false`, relay transport `false`,
relay payload proof `false`, and git dirty on the evidence files.

Public release remains No-Go until second-PC runtime/multi-device evidence,
hosted P2P relay payload proof, support mailbox evidence, and Store evidence
are complete.
