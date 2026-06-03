# 2026-06-03 Post Transport Descriptor Primary Evidence Index Refresh

After documenting the post relay transport descriptor primary evidence refresh,
the repo was re-indexed with the explicit packaged WindowsApps alias:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee
```

Result:

- indexed `1689` files
- indexed `2307` symbols

Indexed context included GOAL v422, wiki/612, fresh primary evidence
`20260603-131556-HUGH_SECOND`, `20260603-131811-HUGH_SECOND.desktop-open`, and
`20260603-131938-HUGH_SECOND.runtime-cpu-scenario-matrix`, plus the canonical
report, BETA checklist, WIKI/WIKI_INDEX updates, and CoS memories.

Search terms should include `GOAL v423`, `wiki/613 index refresh`,
`1689 files`, `2307 symbols`, `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_131938`,
`post transport descriptor primary evidence refresh`, `runtime idle CPU 1/2`,
and `runtime CPU matrix 1/2`.
