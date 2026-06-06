# 2026-06-06 relay preflight failure evidence hardening

Relay connect and release payload preflight failure responses now return
structured release status fields for invalid JSON and invalid metadata.

Changed:

- `musu-bee/src/app/api/v1/relay/connect/route.ts`
- `musu-bee/src/app/api/v1/relay/payload/route.ts`
- `musu-bee/src/app/api/v1/relay/connect/route.test.ts`
- `musu-bee/src/app/api/v1/relay/payload/route.test.ts`
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1`

Failure responses now include schema/status fields plus accepted/transit
booleans set false:

- relay connect: `relay_connect_accepted=false`,
  `payload_transported=false`, `lease_verified=false`
- release payload preflight: `release_payload_accepted=false`,
  `payload_stored=false`, `payload_transported=false`,
  `lease_verified=false`

Validation:

- P2P tests: `107/107`
- typecheck: pass
- P2P relay contract audit: `ok=true`, `fail_count=0`
- release verifier: `ok=true`, `case_count=66`, `failed_case_count=0`
- `git diff --check`: pass

Qualitative evaluation: no high/medium issue found. This is failure-handling
and release-evidence hardening only; release relay tunnel payload transport is
still not implemented. MUSU Desktop remains local executor. MUSU.PRO remains
remote input, project room, rendezvous, path-selection, relay fallback policy,
and evidence/control plane.
