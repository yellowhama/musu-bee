# 2026-06-06 room work-order command audit index refresh

MUSU local indexer was refreshed after the room work-order command audit
hardening and docs update.

Command:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee
```

Result:

- `2519 files`
- `2732 symbols`
- `9705 ms`

Search terms:

- `rooms.work_orders`
- `room.work_order`
- `appendControlAudit`
- `p2pControlPrincipal`
- `command-center.jsonl`
- `instruction text excluded`
- `operator_api_security_contract_verified=true`
- `MUSU.PRO remote input`
- `MUSU Desktop local executor`

