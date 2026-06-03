# 2026-06-03 Relay Payload Endpoint Fail-Closed Index Refresh

Indexer command:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee
```

Result:

- indexed `1715` files
- indexed `2312` symbols

Context:

- GOAL v433
- wiki/623 index refresh
- source/tests for `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- `relay_payload_endpoint_wired`
- `relay_payload_endpoint_not_wired`
- `relay_route_payload_endpoint_not_wired`
- canonical report
  `docs\RELEASE_1_15_0_RC1_RELAY_PAYLOAD_ENDPOINT_FAIL_CLOSED_2026_06_03.md`
