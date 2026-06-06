# 2026-06-06 MSIX alias persisted PATH gate index refresh

MUSU local indexer was refreshed after the MSIX alias persisted PATH gate.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2604 files`
- `2754 symbols`
- `17847 ms`

The explicit WindowsApps alias was used because current Codex process PATH is
stale while persisted PATH is clean.

Search terms: `GOAL v653`, `wiki/828`,
`MSIX alias persisted PATH gate index refresh`,
`alias_path_scope=persisted_user_machine`, `current_process_path_stale`.

