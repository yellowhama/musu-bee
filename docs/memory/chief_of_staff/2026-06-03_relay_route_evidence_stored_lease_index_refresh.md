# 2026-06-03 Relay route evidence stored lease index refresh

Indexer command:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee
```

Result:

- indexed 1667 files
- indexed 2296 symbols
- elapsed 11833 ms

Indexed context:

- GOAL v415
- wiki/606
- `route-evidence/route.ts` stored relay lease verification
- `route-evidence/route.test.ts` 13/13 coverage
- `RELEASE_1_15_0_RC1_RELAY_ROUTE_EVIDENCE_STORED_LEASE_GATE_2026_06_03.md`
- CoS memory `2026-06-03_relay_route_evidence_stored_lease_gate.md`

Search terms:

- `relay_route_lease_not_found`
- `relay_route_lease_attempts_mismatch`
- `relay_route_lease_store_unavailable`
- `queryRelayLeases`
- `owner-scoped stored relay lease`
- `test:p2p 29/29`
