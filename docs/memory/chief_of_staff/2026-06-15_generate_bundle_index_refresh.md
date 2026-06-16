# 2026-06-15 Generate Bundle Index Refresh

Durable memory for wiki/1161.

After wiki/1160 Generate bundle wiring audit and browser QA coverage update,
the MUSU local indexer was refreshed.

Command:

`& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`

Result:

- `3202 files`
- `3481 symbols`
- `17143 ms`

Indexed context includes `wiki/1160`, `Generate bundle`,
`private_mesh_bootstrap`, `runMeshBootstrap`, `bootstrap-server-url`,
`bootstrap-result`, `bootstrap-files`, `__bootstrapCalls`,
`musu.private_mesh_bootstrap.v1`, Add PC step 1, and no copied bootstrap
command.
