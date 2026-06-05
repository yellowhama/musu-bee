# 2026-06-06 network watcher scope index refresh

MUSU local indexing was refreshed after the network watcher scope contract gate.

Command:

`& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`

Result:

- `2486 files`
- `2719 symbols`
- `10887 ms`

Indexed context:

- GOAL v598/v599
- wiki/773/wiki/774
- `RELEASE_1_15_0_RC1_NETWORK_WATCHER_SCOPE_CONTRACT_GATE_2026_06_06.md`
- BETA checklist
- network boundary spec
- changed release verifier scripts
- CoS memory `2026-06-06_network_watcher_scope_contract_gate.md`

gbrain was not rerun because the same-session blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures, `sync.last_commit`
not advancing, and `gstack-brain-sync exited undefined`. Do not add GBrain
Search Guidance to `AGENTS.md` until semantic/symbol search returns verified
hits on this Windows machine.

Search terms should include `GOAL v599`, `wiki/774`,
`network watcher scope index refresh`, `2486 files`, `2719 symbols`,
`10887 ms`, `network_watcher_primitive_hit_count=0`,
`rust background audit limits network watcher scope`,
`release verifier 48/48`, `MUSU Desktop local executor`, and
`MUSU.PRO remote input control plane`.
