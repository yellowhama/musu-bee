# 2026-06-03 Bounded Frontend SSE Index Refresh

Indexer command:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee
```

Result:

- indexed `1732` files
- indexed `2318` symbols

Context:

- GOAL v437
- wiki/627 index refresh
- `useBoundedEventSource`
- fleet/company/machine/TasksPanel SSE migration
- runtime-polling contract `14/14`
- canonical report:
  `docs/RELEASE_1_15_0_RC1_BOUNDED_FRONTEND_SSE_HARDENING_2026_06_03.md`
