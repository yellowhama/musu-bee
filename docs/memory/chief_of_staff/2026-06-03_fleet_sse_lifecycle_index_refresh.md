# 2026-06-03 Fleet SSE Lifecycle Index Refresh

After the Fleet SSE lifecycle hardening docs and code changes, the repo was
re-indexed with the explicit packaged WindowsApps alias:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee
```

Result:

- indexed files: `1618`
- indexed symbols: `2283`

Indexed context includes:

- GOAL v395/v396
- wiki/594 and wiki/595
- `RELEASE_1_15_0_RC1_FLEET_SSE_LIFECYCLE_HARDENING_2026_06_03.md`
- Fleet SSE code changes in `useFleetStore`
- dashboard Fleet/Agent `closeSSE()` cleanup
- runtime-polling contract test update
- BETA checklist update
- WIKI and WIKI_INDEX updates

Search terms:

- `fleet SSE lifecycle hardening`
- `FLEET_SSE_RECONNECT_INITIAL_MS`
- `FLEET_SSE_RECONNECT_MAX_MS`
- `FLEET_SSE_MAX_RETRIES`
- `fleetReconnectGeneration`
- `closeSSE`
- `runtime-polling 12/12`
- `aa23fc85`
- `single_machine_verified=false`
- `fresh current-HEAD MSIX evidence required`
