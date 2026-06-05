# 2026-06-06 degraded mode contract index refresh

MUSU local indexing was refreshed after the degraded-mode contract gate.

Indexer command:

- `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`

Result:

- `2491 files`
- `2731 symbols`
- `11348 ms`

Indexed context included:

- GOAL v600/v601
- wiki/775/wiki/776
- degraded-mode contract report
- degraded-mode next steps report
- BETA checklist update
- network boundary spec update
- release verifier source-contract updates
- CoS memory `2026-06-06_degraded_mode_contract_gate.md`

gbrain was not rerun because the same-session blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures, `sync.last_commit`
not advancing, and `gstack-brain-sync exited undefined`; the MUSU local index
remains the reliable current code/document index.

Search terms should include `GOAL v601`, `wiki/776`,
`degraded mode contract index refresh`, `2491 files`, `2731 symbols`,
`11348 ms`, `musu.degraded_mode_contract.v1`,
`degraded_mode_contract_verified`, `health-fallback`, `offline-fallback`,
`DeviceStatusResponse`, `release verifier 51/51`, `MUSU Desktop local executor`,
and `MUSU.PRO remote input control plane`.
