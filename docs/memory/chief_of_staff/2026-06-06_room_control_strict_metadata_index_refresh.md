# 2026-06-06 Room Control Strict Metadata Index Refresh

MUSU local indexer was refreshed after the room control strict metadata
hardening work.

Command:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee
```

Result:

- `2559 files`
- `2751 symbols`
- `12944 ms`

Indexed context:

- GOAL v628/v629
- wiki/803/wiki/804
- room rendezvous strict metadata source/test changes
- room presence strict metadata source/test changes
- P2P store-forward relay contract audit update
- `docs\RELEASE_1_15_0_RC1_ROOM_CONTROL_STRICT_METADATA_GATE_2026_06_06.md`
- BETA checklist
- network boundary spec
- MUSU.PRO P2P control-plane spec
- CoS memory updates

Search terms:

- `GOAL v629`
- `wiki/804`
- `room control strict metadata index refresh`
- `RoomRendezvousSchema strict`
- `RoomPresenceSchema strict`
- `CandidateEndpointSchema strict`
- `room_rendezvous_payload_bytes_not_accepted`
- `room_presence_payload_bytes_not_accepted`
- `P2P store-forward relay audit check_count=64`
