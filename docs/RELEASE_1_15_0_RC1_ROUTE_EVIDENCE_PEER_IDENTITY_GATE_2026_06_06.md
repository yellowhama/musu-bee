# Release 1.15.0-rc.1 Route Evidence Peer Identity Gate

Date: 2026-06-06
Branch: `harden-relay-fallback-payload-evidence`
Scope: hosted P2P route evidence release-grade identity proof

## Summary

Route evidence release grading now requires the top-level peer identity proof
to use the release-grade identity method and fingerprint shape.

Before this change, relay transport proof already required
`peer_identity_method=quic_tls_cert_fingerprint` and a `sha256:` fingerprint,
but top-level direct route evidence only required identity material to be
present. That left room for a route record to claim `peer_identity_verified`
with a non-release method while still satisfying the rest of the direct-route
release checks.

## Code Changes

Updated route evidence release blockers:

- `peer_identity_method_not_release_grade`
- `peer_public_key_not_fingerprint`

Updated release-grade query filtering:

- `hasCurrentPeerIdentityProof()` now revalidates stored records before a
  stale/manual `release_grade=true` record can be returned from
  `queryRouteEvidenceRecords({ release_grade: true })`.

Updated files:

- `musu-bee/src/app/api/v1/p2p/route-evidence/route.ts`
- `musu-bee/src/lib/routeEvidenceStore.ts`
- `musu-bee/src/app/api/v1/p2p/route-evidence/route.test.ts`
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1`

## Validation

- `npm run test:p2p -- --test-name-pattern "route evidence"`:
  `108/108` passing
- `npm run typecheck`: pass
- `audit-p2p-store-forward-relay-contract.ps1 -Json`: `ok=true`,
  `fail_count=0`
- `test-release-evidence-verifiers.ps1 -Json`: `ok=true`, `case_count=66`,
  `failed_case_count=0`
- `git diff --check`: pass

## Index Refresh

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2655 files`
- `2758 symbols`
- `11366 ms`

## Qualitative Evaluation

No high or medium issue was found.

This is release evidence integrity hardening. It does not complete second-PC
proof, hosted relay tunnel transport, production KV/Upstash, support mailbox,
or Store evidence.

## Product Boundary

MUSU Desktop remains the local executor. MUSU.PRO remains the remote input,
project/company room, rendezvous, path-selection, relay fallback policy, and
evidence/control plane.

## Next Steps

- Install the current MUSU build on a real second Windows machine and import
  current route/CPU/matrix evidence.
- Configure production P2P storage and runtime login for `https://musu.pro`.
- Implement release `quic_relay_tunnel` payload transport and record matching
  relay transport and payload delivery proofs.
