# 2026-06-14 Private Mesh Console Flicker Doc Sync Index Refresh

MUSU local indexer was refreshed after the Private Mesh no-signup docs,
desktop console flicker hardening, local fleet bridge refresh, and
`local_fleet_auth_failed` audit fix.

Command:

`& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`

Result:

- `3189 files`
- `3471 symbols`
- `94475 ms`

Indexed context includes:

- `list_fleet()` direct bridge `/api/fleet/status` refresh
- `http_get_with_bearer`
- `bearer_authorization_header`
- `http_status_code`
- `local_fleet_auth_failed`
- `PRIVATE_MESH_STATUS_REFRESH_MS`
- `musu.device_add.v1`
- `tailnet_ip` public docs language
- installed MSIX `1.15.0.2` passive refresh evidence
- `nodes_processes=0`, `mesh_status_processes=0`,
  `other_child_cli_processes=0`
- wiki/1152

Search terms should include `wiki/1153`, `3189 files`, `3471 symbols`,
`94475 ms`, `local_fleet_auth_failed`, `musu.device_add.v1`,
`tailnet_ip`, `Private Mesh console flicker`, and
`No Tailscale.com account`.
