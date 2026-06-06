# 2026-06-06 current MSIX alias shadow live gate index refresh

MUSU local indexer was refreshed after the current MSIX alias shadow live gate.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2601 files`
- `2754 symbols`
- `13353 ms`

The explicit WindowsApps alias was used because terminal `musu` currently
resolves to the developer binary before the packaged alias.

Search terms: `GOAL v651`, `wiki/826`, `msix_current_legacy_conflicts_ok`,
`msix-current-legacy-conflicts`, `musu 1.15.0-dev`, `musu 1.15.0-rc.1`,
`current MSIX alias shadow live gate index refresh`.

