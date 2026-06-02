# MUSU 1.15.0-rc.1 Relay Route Lease-Proof Hardening

Recorded: 2026-06-02 KST  
Scope: `musu.pro` P2P route-evidence API

## Change

`POST /api/v1/p2p/route-evidence` now treats `route_kind=relay` as
release-grade only when the evidence also proves the relay fallback lease.

Relay route evidence must include:

- `relay_fallback.direct_path_failed=true`
- `relay_fallback.lease_requested=true`
- `relay_fallback.status=issued`
- `relay_fallback.lease_issued=true`
- non-empty `relay_fallback.lease_id`
- at least one prior attempted route kind other than `relay`
- no relay policy blockers

Without that proof, the API still accepts and stores the evidence for audit,
but returns `release_grade=false` with blockers such as
`relay_route_missing_lease_proof`, `relay_route_lease_not_issued`, or
`relay_route_lease_blocked`.

## Why

The product contract says `musu.pro` is the rendezvous/lease/control-plane
surface and not the default payload data path. A relay route must therefore be
an explicit fallback after direct route failure, not just a route record that
claims `route_kind=relay`.

This prevents a false release signal where a route record could claim relay
transit and release-grade encryption without proving that the owner-scoped
Connect/Pro relay policy issued a lease.

## Validation

- `npm run test:p2p -- src/app/api/v1/p2p/route-evidence/route.test.ts`
  passed 23/23.
- `npm run typecheck` passed.
- `npm run build` passed.

Current-commit single-machine smoke was refreshed after the API hardening:

- evidence:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-231612-HUGH_SECOND.evidence.json`
- verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-231612-HUGH_SECOND.verification.json`
- dashboard task: `a4ea114c-2483-4135-8dd0-756cf915d7a3`
- bridge: `http://127.0.0.1:13886`
- CLI route checked: `true`

## Release Impact

This tightens the verifier only. It does not implement relay/tunnel payload
transport and does not close the live P2P gate. Public release remains No-Go
until production KV-backed owner-scoped relay leases, release-grade route
transport proof, second-PC evidence, support mailbox evidence, and Store
evidence are complete.
