# 2026-06-06 P2P Proof Count Triplet Status Surface Index Refresh

## Decision

After surfacing P2P route transport proof and payload delivery proof
required/valid/invalid triplets through the release status chain, refresh the
local MUSU index so future agents can retrieve the updated code, specs, wiki,
release checklist, canonical report, and next-step plan.

## Index Evidence

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- result: `indexed 2751 files (2776 symbols) in 15134 ms`
- GOAL row: `GOAL v719`
- wiki row: `wiki/894`

## Product Spec Update

The product boundary remains local-first:

- MUSU Desktop does the work locally on each device.
- MUSU.PRO coordinates remote user input, rooms, rendezvous, path selection,
  relay fallback, and release evidence.
- Hosted relay proof and payload proof must expose required/valid/invalid
  counts so a zero-valid state is actionable instead of opaque.

## Audit Result

No high/medium issue was found in the status-surface change. The change is
diagnostic hardening only and does not satisfy the remaining release blockers:
second-PC route/CPU/matrix evidence, live MUSU.PRO P2P/relay proof, support
mailbox proof, and Store proof.
