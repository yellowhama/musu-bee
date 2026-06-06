# 2026-06-07 Single-Instance Freshness Gate Index Refresh

## Result

MUSU local indexer was refreshed after the single-instance freshness gate.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2757 files`
- `2776 symbols`
- `15488 ms`

## Indexed Context

Indexed context includes `write-release-go-no-go.ps1` startup/desktop
single-instance freshness checks, release verifier source-contract case
`go-no-go single-instance evidence requires current freshness`, runtime
stabilization spec update, canonical report, next-step plan, BETA checklist,
GOAL, WIKI/WIKI_INDEX, and CoS memory.

## Search Terms

Search terms should include `GOAL v723`, `wiki/898`,
`single-instance freshness gate index refresh`, `2757 files`,
`2776 symbols`, `15488 ms`, `startup_single_instance_verified`,
`desktop_single_instance_verified`, `Test-StartupSingleInstanceEvidence`,
`Test-DesktopSingleInstanceEvidence`, `ExpectedGitCommit`,
`Test-DocumentationOrStatusOnlyGitDelta`, and `case_count=86`.
