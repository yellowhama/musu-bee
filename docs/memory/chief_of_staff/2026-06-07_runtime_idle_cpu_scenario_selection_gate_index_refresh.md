# 2026-06-07 Runtime Idle CPU Scenario Selection Gate Index Refresh

MUSU local indexer was refreshed after the runtime idle CPU scenario selection
gate, GOAL v790, and wiki/965.

Command:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee
```

Result:

- `2912 files`
- `2790 symbols`
- `20441 ms`

Indexed context includes:

- `scripts\windows\write-release-go-no-go.ps1`
- `scripts\windows\test-release-evidence-verifiers.ps1`
- `docs\RELEASE_1_15_0_RC1_RUNTIME_IDLE_CPU_SCENARIO_SELECTION_GATE_2026_06_07.md`
- BETA checklist scenario selection section
- runtime stabilization plan update
- WIKI/WIKI_INDEX/GOAL updates

Search terms should include `GOAL v791`, `wiki/966`,
`runtime idle CPU scenario selection index refresh`, `2912 files`,
`2790 symbols`, `20441 ms`, `latest-per-machine-up-to-12`, and
`startup-open masked desktop-open`.
