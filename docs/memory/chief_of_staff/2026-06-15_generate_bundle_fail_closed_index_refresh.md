# 2026-06-15 Generate Bundle Fail-Closed Index Refresh

Durable memory for wiki/1163.

After wiki/1162 Generate bundle fail-closed audit and browser QA coverage
update, the MUSU local indexer was refreshed.

Command:

`& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`

Result:

- `3205 files`
- `3481 symbols`
- `13575 ms`

Indexed context includes `wiki/1162`, `Generate bundle fail-closed`,
`Use a full mesh host URL`, `Enter your mesh host URL first`,
`__bootstrapCalls`, `private_mesh_bootstrap`, `bootstrap-server-url`, and
native IPC validation gating.
