# Release 1.15.0-rc.1 Relay Preflight Failure Evidence Hardening

Date: 2026-06-06
Branch: `harden-relay-fallback-payload-evidence`
Scope: hosted P2P relay connect/payload preflight failure handling

## Summary

The release relay connect and release relay payload preflight endpoints now
return evidence-friendly status fields even for invalid JSON and invalid
metadata requests.

This keeps failure handling fail-closed while giving operators enough
structured context to understand why hosted relay proof is not release-ready:
the response includes the relay schema, method, endpoint wiring flags,
transport kind, release transport requirement, blockers, and explicit
accepted/transit booleans set to false.

## Code Changes

Updated endpoints:

- `musu-bee/src/app/api/v1/relay/connect/route.ts`
- `musu-bee/src/app/api/v1/relay/payload/route.ts`

Updated regression tests:

- `musu-bee/src/app/api/v1/relay/connect/route.test.ts`
- `musu-bee/src/app/api/v1/relay/payload/route.test.ts`

Updated release gate audit:

- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1`

## Behavior

Relay connect preflight invalid JSON and invalid metadata now include:

- `schema=musu.relay_connect.v1`
- `relay_connect_accepted=false`
- `payload_transported=false`
- `lease_verified=false`
- relay connect/payload/queue wiring fields
- relay transport blockers

Relay payload preflight invalid JSON and invalid metadata now include:

- `schema=musu.relay_payload_preflight.v1`
- `release_payload_accepted=false`
- `payload_stored=false`
- `payload_transported=false`
- `lease_verified=false`
- release payload preflight/payload/queue wiring fields
- relay transport blockers

No payload bytes are accepted. No queue fallback is counted as release relay
transport. No relay transport proof or relay payload delivery proof is emitted
by these failure paths.

## Validation

- `npm run test:p2p -- --test-name-pattern "relay connect|relay payload"`:
  `107/107` passing
- `npm run typecheck`: pass
- `audit-p2p-store-forward-relay-contract.ps1 -Json`: `ok=true`,
  `fail_count=0`
- `test-release-evidence-verifiers.ps1 -Json`: `ok=true`, `case_count=66`,
  `failed_case_count=0`
- `git diff --check`: pass

## Index Refresh

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2652 files`
- `2757 symbols`
- `12802 ms`

## Qualitative Evaluation

No high or medium issue was found.

This is failure-handling and release-evidence hardening. It does not implement
the missing release relay tunnel payload transport. Hosted P2P release proof
still requires production KV/Upstash storage, packaged runtime login,
`quic_relay_tunnel` transport, `quic_tls_1_3` proof, owner-scoped relay route
evidence, relay transport proof, and relay payload delivery proof.

## Product Boundary

The product boundary remains unchanged:

- MUSU Desktop is the local executor and resource owner.
- MUSU.PRO is remote input, project/company room, rendezvous, path-selection,
  relay fallback policy, and evidence/control plane.
- The preview store-forward queue remains non-release-grade.
- The release relay payload endpoint remains preflight-only until real tunnel
  payload transport exists.

## Next Steps

- Keep second-PC route/CPU/matrix evidence as the next machine-level release
  gate.
- Configure production KV/Upstash and packaged runtime login for hosted P2P
  evidence.
- Implement the actual release tunnel payload path before changing
  `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`.
