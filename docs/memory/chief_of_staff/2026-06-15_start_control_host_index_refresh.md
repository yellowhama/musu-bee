# 2026-06-15 Start Control Host Index Refresh

Durable memory for wiki/1159.

After wiki/1158 Start control host wiring audit and browser QA coverage update,
the MUSU local indexer was refreshed.

Command:

`& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`

Result:

- `3199 files`
- `3481 symbols`
- `16384 ms`

Indexed context includes `wiki/1158`, `Start control host`,
`private_mesh_start_control_host`, `runStartControlHost`,
`start-control-host-result`, `__startControlHostCalls`,
`musu.start_control_host.v1`, Add PC step 2, and no copied docker compose
command.
