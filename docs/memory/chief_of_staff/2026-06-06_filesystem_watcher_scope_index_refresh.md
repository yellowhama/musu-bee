# 2026-06-06 filesystem watcher scope index refresh

MUSU local indexing was refreshed after the filesystem watcher scope contract
gate.

Command:

`& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`

Result:

- `2483 files`
- `2719 symbols`
- `10455 ms`

Indexed context:

- GOAL v596/v597
- wiki/771/wiki/772
- `RELEASE_1_15_0_RC1_FILESYSTEM_WATCHER_SCOPE_CONTRACT_GATE_2026_06_06.md`
- BETA checklist
- network boundary spec
- changed release verifier scripts
- CoS memory `2026-06-06_filesystem_watcher_scope_contract_gate.md`

gbrain was not rerun because the same-session blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures, `sync.last_commit`
not advancing, and `gstack-brain-sync exited undefined`. Do not add GBrain
Search Guidance to `AGENTS.md` until semantic/symbol search returns verified
hits on this Windows machine.

Search terms should include `GOAL v597`, `wiki/772`,
`filesystem watcher scope index refresh`, `2483 files`, `2719 symbols`,
`10455 ms`, `filesystem_watcher_primitive_hit_count=0`,
`file_sync_watcher_start_hit_count=0`,
`rust background audit limits filesystem watcher scope`,
`release verifier 47/47`, `MUSU Desktop local executor`, and
`MUSU.PRO remote input control plane`.
