# 2026-06-15 Add PC Join-Key Wiring Index Refresh

MUSU local indexer was refreshed after the Add PC join-key Cockpit wiring,
stale pass fallback removal, helper no-window mitigation, and wiki/spec updates.

Command:

`& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`

Result:

- `3193 files`
- `3477 symbols`
- `26919 ms`

Indexed context includes:

- `private_mesh_create_join_key`
- `runDeviceAddPassIssue`
- `device-add-pass-generate`
- `musu.create_join_key.v1`
- `musu.device_add.v1`
- `CREATE_NO_WINDOW`
- stale pass fallback removal
- wiki/1154

Search terms should include `wiki/1155`, `3193 files`, `3477 symbols`,
`26919 ms`, `private_mesh_create_join_key`, `runDeviceAddPassIssue`,
`device-add-pass-generate`, `stale pass fallback`, and `open_dashboard`.
