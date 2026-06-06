# 2026-06-06 Runtime Relay Candidate Coverage Carry Index Refresh

MUSU local indexer was refreshed after the runtime relay candidate coverage
carry source/spec/wiki updates.

Command:

`& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`

Result:

- `2675 files`
- `2776 symbols`
- `18098 ms`

Indexed context includes `route_peers_from_target_candidates`,
`candidate_route_kind_labels`, `route_kind_labels_to_cloud`,
`candidate_route_kinds`, `attempted_route_kinds`,
`P2pRelayPayloadRequest`, `P2pRelayPayloadStoredRecord`, GOAL v680,
wiki/855, the canonical report, next-step plan, BETA checklist, P2P specs,
WIKI/WIKI_INDEX, and CoS memory.
