# 2026-06-03 Post Fleet SSE Primary Evidence Index Refresh

After the post Fleet SSE primary evidence refresh, the repo was re-indexed with
the explicit packaged WindowsApps alias:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee
```

Result:

- indexed files: `1630`
- indexed symbols: `2283`

Indexed context includes:

- GOAL v397/v398
- wiki/595 and wiki/596
- `RELEASE_1_15_0_RC1_POST_FLEET_SSE_PRIMARY_EVIDENCE_REFRESH_2026_06_03.md`
- fresh single-machine evidence `20260603-073941-HUGH_SECOND`
- fresh desktop-open CPU evidence `20260603-074231-HUGH_SECOND.desktop-open`
- fresh runtime matrix `20260603-074415-HUGH_SECOND.runtime-cpu-scenario-matrix`
- BETA checklist update
- runtime hardening roadmap update
- WIKI and WIKI_INDEX updates

Search terms:

- `post Fleet SSE primary evidence refresh`
- `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_074415`
- `single_machine_verified=true`
- `runtime idle CPU 1/2`
- `runtime CPU matrix 1/2`
- `cargo bin shadows WindowsApps`
- `1630 files`
- `2283 symbols`
