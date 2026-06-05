# 2026-06-06 relay connect preflight strict metadata index refresh

MUSU local indexer was refreshed after the relay connect preflight strict
metadata gate source, docs, spec, wiki, checklist, and CoS memory updates.

Command:

`& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`

Result:

- `2543 files`
- `2734 symbols`
- `9848 ms`

gbrain was not rerun because the same-session blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures, `sync.last_commit`
not advancing, and `gstack-brain-sync exited undefined`. The MUSU local index
is the current reliable code/document index.

Search terms:

- `GOAL v619`
- `wiki/794`
- `relay connect preflight strict metadata index refresh`
- `2543 files`
- `2734 symbols`
- `9848 ms`
- `musu.relay_connect_request.v1`
- `relay_connect_payload_bytes_not_accepted`
- `release connect preflight regression coverage`
- `P2P store-forward relay audit fail_count=0`

