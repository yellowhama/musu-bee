# 2026-06-06 second-PC route-attempt target binding gate index refresh

MUSU local indexer was refreshed after the second-PC route-attempt target
binding gate hardening.

Command:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee
```

Result:

- `2730 files`
- `2776 symbols`
- `13306 ms`

Indexed context includes:

- `verify-runtime-cpu-scenario-matrix.ps1` route command/argument target
  binding checks
- `test-release-evidence-verifiers.ps1` source-contract case
  `runtime CPU matrix target command binding contract`
- negative regression
  `runtime matrix rejects target field not bound to route command arguments`
- canonical report
  `RELEASE_1_15_0_RC1_SECOND_PC_ROUTE_ATTEMPT_TARGET_BINDING_GATE_2026_06_06.md`
- GOAL v704
- WIKI wiki/879

Search terms:

- `GOAL v705`
- `wiki/880`
- `second-PC route-attempt target binding gate index refresh`
- `route_probe.command`
- `route_probe.arguments`
- `--target <target>`
- `runtime_cpu_second_pc_route_attempt`
- `case_count=73`

