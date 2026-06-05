# 2026-06-06 runtime idle CPU full role attribution index refresh

## Decision

Use the MUSU local index as the current code/document search index for the
runtime idle CPU full-role attribution gate.

## Index result

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- files: `2480`
- symbols: `2719`
- elapsed: `9798 ms`

## Context indexed

- GOAL v594/v595
- wiki/769/wiki/770
- runtime idle CPU full-role attribution report
- BETA checklist update
- release verifier source-contract update
- CoS memory for the verifier hardening decision

## gbrain status

gbrain was not rerun because the same-session blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures, `sync.last_commit`
not advancing, and `gstack-brain-sync exited undefined`.

The MUSU local index remains the reliable current code/document index.
