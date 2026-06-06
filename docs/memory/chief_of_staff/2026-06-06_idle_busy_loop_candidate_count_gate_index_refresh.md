# 2026-06-06 idle busy-loop candidate count gate index refresh

MUSU local indexer was refreshed after the idle busy-loop candidate count gate.

Command:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee
```

Result:

- `2736 files`
- `2776 symbols`
- `14211 ms`

Indexed context includes:

- `write-release-go-no-go.ps1` top-level idle busy-loop candidate count fields
- `test-release-evidence-verifiers.ps1` source-contract needles for those
  fields
- canonical report
  `RELEASE_1_15_0_RC1_IDLE_BUSY_LOOP_CANDIDATE_COUNT_GATE_2026_06_06.md`
- GOAL v708
- WIKI wiki/883

Search terms:

- `GOAL v709`
- `wiki/884`
- `idle busy-loop candidate count gate index refresh`
- `2736 files`
- `2776 symbols`
- `14211 ms`
- `idle_busy_loop_candidate_verified_count`
- `case_count=77`
