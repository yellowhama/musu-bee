# 2026-06-06 release relay payload byte rejection index refresh

## Index result

MUSU local indexer succeeded:

- command: `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- files: `2474`
- symbols: `2719`
- duration: `11548 ms`

## Indexed context

The refresh followed release relay payload preflight byte rejection:

- wiki/765
- GOAL v590
- `RELEASE_1_15_0_RC1_RELEASE_RELAY_PAYLOAD_PREFLIGHT_BYTE_REJECTION_2026_06_06.md`
- P2P control-plane spec
- BETA checklist
- WIKI/WIKI_INDEX
- CoS memory note

## GBrain status

gbrain was not rerun. The active same-session blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures,
`sync.last_commit` not advancing, and `gstack-brain-sync exited undefined`.
The MUSU local index is the reliable current code/document index.
