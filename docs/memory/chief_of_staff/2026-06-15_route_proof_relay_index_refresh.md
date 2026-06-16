# 2026-06-15 Route Proof And Relay Index Refresh

Durable memory for wiki/1157.

After wiki/1156 route/proof/relay audit and the updated Add PC/open_dashboard
documentation, the MUSU local indexer was refreshed.

Command:

`& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`

Result:

- `3196 files`
- `3481 symbols`
- `16812 ms`

Indexed context includes `wiki/1156`,
`release_relay_tunnel_runtime_not_implemented`,
`release_relay_transport_proof_missing`,
`record_target_relay_payload_delivery_route_evidence`,
`record_release_relay_payload_delivery_route_evidence`, `task_route_proof`,
`record_task_callback_proof`, `auto_register_peers_with_cancellation`,
`warning-free cargo check`, `private_mesh_create_join_key`, and
`open_dashboard`.
