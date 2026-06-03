# MUSU 1.15.0-rc.1 Relay Route Evidence Stored Lease Gate

Date: 2026-06-03

## Summary

Relay route evidence can no longer become release-grade by presenting an
issued-looking `relay_fallback.lease_id` JSON field alone.

`POST /api/v1/p2p/route-evidence` now verifies `route_kind=relay` evidence
against the owner-scoped relay lease store before marking it release-grade.

## New Release-Grade Relay Evidence Requirements

For relay route evidence, the route evidence API still requires:

- `result=success`
- `route_kind=relay`
- `payload_transited_musu_infra=true`
- peer identity proof
- release-grade `quic_tls_1_3` encryption
- `transport_verified_by=musu_quic_tls_transport`
- relay fallback proof showing direct path failure and issued lease status

It now also requires a stored relay lease that matches:

- same owner key derived from the bearer token
- same `session_id`
- same `source_node_id`
- same `target_node_id`
- same `lease_id`
- same attempted route kind set

If the route evidence claims an issued relay lease but no matching owner-scoped
stored lease exists, the evidence is stored but marked non-release-grade with:

- `relay_route_lease_not_found`

If the stored lease and route evidence disagree on attempted route kinds, the
evidence is marked non-release-grade with:

- `relay_route_lease_attempts_mismatch`

If the lease store cannot be queried, the evidence is marked non-release-grade
with:

- `relay_route_lease_store_unavailable:<detail>`

## Why This Matters

The previous route-evidence contract required relay fallback fields but did not
prove that the lease was actually issued by the owner-scoped relay lease API.
That allowed a release-grade-looking relay evidence payload to be accepted using
a made-up lease id.

This change makes the control-plane chain stronger:

1. Direct route fails.
2. Relay lease API issues a Connect/Pro fallback lease.
3. Relay route evidence references that exact stored lease.
4. Route evidence becomes release-grade only if the stored lease and payload
   route proof both line up.

## Validation

Passed:

- `npx tsx --test src/app/api/v1/p2p/route-evidence/route.test.ts`
  - 13/13
- `npm run test:p2p`
  - 29/29
- `npm run typecheck`
- `git diff --check`

## Current Release Interpretation

This is evidence hardening, not relay payload transport completion.

The public release remains No-Go until:

- the relay/tunnel payload transport is implemented and wired
- live `musu.pro` has release-grade owner-scoped KV/Upstash storage
- real owner-scoped relay route evidence exists with `route_kind=relay`,
  `result=success`, `release_grade=true`, and payload transit proof
- two-machine route and CPU evidence pass
