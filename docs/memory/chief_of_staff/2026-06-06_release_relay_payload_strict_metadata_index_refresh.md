# 2026-06-06 release relay payload strict metadata index refresh

## Decision

Use the MUSU local index as the current code/document search index for the
release relay payload strict metadata work.

## Index result

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- files: `2477`
- symbols: `2719`
- elapsed: `10589 ms`

## Context indexed

- GOAL v592/v593
- wiki/767/wiki/768
- strict metadata schema report
- P2P control-plane spec update
- BETA checklist update
- existing release relay payload next-steps handoff note
- CoS memory for the strict metadata decision

## gbrain status

gbrain was not rerun because the same-session blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures, `sync.last_commit`
not advancing, and `gstack-brain-sync exited undefined`.

The MUSU local index remains the reliable current code/document index.
