# 2026-06-07 Frontend Polling Inventory Gate

## Decision

The frontend interval/refetch busy-loop release gate now locks the exact
low-duty polling call-site inventory.

## What Changed

- `audit-frontend-polling-contract.ps1` now carries the 29 expected non-test
  `useLowDutyPolling` call-site paths.
- The existing `low-duty polling call-site inventory` check fails on missing or
  unexpected paths instead of only requiring a loose minimum count.
- Audit JSON now exposes expected, missing, and unexpected low-duty polling
  call-site fields.
- `write-release-go-no-go.ps1` requires the inventory check for the
  `frontend interval/refetch` idle-busy-loop candidate.
- Runtime polling and release verifier contract tests guard the new behavior.

## Validation

- frontend polling audit: `ok=true`, expected/actual `29/29`
- runtime polling tests: `17/17`
- P2P tests: `112/112`
- typecheck: passed
- release evidence verifier regression: `ok=True`
- P2P env status: expected No-Go with 12 blockers
- `git diff --check`: passed

## Product Boundary

MUSU Desktop remains the local executor. MUSU.PRO remains remote input,
project/company room, AI meeting room, presence, rendezvous, path selection,
relay fallback, and evidence/control plane. This gate protects local UI/runtime
idle CPU behavior and does not make MUSU.PRO execute local work.

## Next

Regenerate operator packs from the current committed HEAD, run/import
second-machine evidence, then continue live MUSU.PRO storage/login and real
`quic_relay_tunnel` transport proof work.
