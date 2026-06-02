# 2026-06-03 MSIX Alias Shadow Warning Index Refresh

Explicit packaged alias indexing:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee
```

Result:

- indexed files: `1634`
- indexed symbols: `2283`

Scope:

- GOAL v399-v400
- wiki/596
- MSIX alias shadow warning policy report
- MSIX evidence capture/verifier/recorder/test changes
- BETA checklist, WIKI, WIKI_INDEX updates
- CoS memory `2026-06-03_msix_alias_shadow_warning_policy.md`

Search terms:

- `GOAL v400`
- `1634 files`
- `2283 symbols`
- `wiki/596 index refresh`
- `AliasShadowingMode=warn-explicit-windowsapps`
- `alias_shadowing_accepted=true`
- `developer-warning-only`
