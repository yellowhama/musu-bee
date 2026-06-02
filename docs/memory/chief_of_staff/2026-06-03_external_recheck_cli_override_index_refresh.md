# 2026-06-03 External Recheck CLI Override Index Refresh

Explicit packaged alias indexing:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee
```

Result: `1615` files and `2279` symbols.

Indexed after GOAL v393, wiki/593, `record-external-release-gate-recheck.ps1`
`-MusuExe` passthrough, fresh external evidence
`20260603-065918-HUGH_SECOND.external-gates`, P2P evidence
`20260603-070018-musu.pro`, the current operator pack report, BETA checklist,
P2P control-plane spec, WIKI/WIKI_INDEX, and CoS memory updates.
