# 2026-06-03 MSIX Alias Shadowing Index Refresh

Command:

`& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`

Result:

- indexed `1555` files
- indexed `2274` symbols

This refresh followed GOAL v375, wiki/584, the MSIX alias shadowing release
tooling changes, the canonical hardening report, BETA/current-head/WIKI/WIKI_INDEX
updates, and CoS memory `2026-06-03_msix_alias_shadowing_hardening.md`.

Search terms should include:

- `GOAL v376`
- `1555 files`
- `2274 symbols`
- `wiki/584 index refresh`
- `windowsapps_alias_invocation`
- `AliasShadowing`
- `AlternateAliasSources`
- `runtime_package_ready=True`
- `local_artifacts_ready=True`
