# 2026-06-06 P2P env runtime login index refresh

MUSU local indexer was refreshed after the P2P env runtime login remediation
source, verifier, report, wiki, checklist, CONFIG, and CoS memory updates.

Command:

`& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`

Result:

- `2580 files`
- `2751 symbols`
- `12902 ms`

Indexed context includes:

- `show-musu-pro-p2p-env-status.ps1` runtime login remediation
- `live_evidence_p2p_runtime_not_logged_in`
- `relay_status_logged_in`
- `relay_transport_logged_in`
- `relay_leases_logged_in`
- `relay_route_evidence_logged_in`
- `P2P env status exposes runtime login remediation`
- release verifier regression `56/56`
- canonical report
- BETA checklist
- WIKI/WIKI_INDEX
- CONFIG

Search terms should include `GOAL v637`, `wiki/812`,
`P2P env runtime login index refresh`, `2580 files`, `2751 symbols`,
`12902 ms`, `WindowsApps alias`, `musu.exe login`,
`localhost developer dashboard`, and `20260606-090333-musu.pro`.
