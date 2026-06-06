# 2026-06-06 second-PC route-attempt self-target gate index refresh

MUSU local indexer was refreshed after the second-PC route-attempt self-target
gate hardening.

Command:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee
```

Result:

- `2727 files`
- `2776 symbols`
- `20946 ms`

Indexed context includes:

- `verify-runtime-cpu-scenario-matrix.ps1` `-RejectSelfPostRouteTarget`
- `write-release-go-no-go.ps1` targeted second-PC route-attempt verifier args
- release verifier regression case
  `runtime matrix rejects self-target second-PC route attempt`
- canonical report
  `RELEASE_1_15_0_RC1_SECOND_PC_ROUTE_ATTEMPT_SELF_TARGET_GATE_2026_06_06.md`
- GOAL v702
- WIKI wiki/877

Search terms:

- `GOAL v703`
- `wiki/878`
- `second-PC route-attempt self-target gate index refresh`
- `RejectSelfPostRouteTarget`
- `runtime_cpu_second_pc_route_attempt`
- `route_probe.target`
- `operator_machine`
- `case_count=71`

