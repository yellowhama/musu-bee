# MUSU 1.15.0-rc.1 Relay Route Evidence Stale Proof Query Gate - 2026-06-04

## Context

The live `musu.pro` P2P control-plane status still reports public release
No-Go for relay proof:

- production KV/Upstash REST env is not configured
- release-grade relay transport is not wired
- owner-scoped release-grade relay route evidence count is `0`
- relay payload transport proof is `false`
- relay payload delivery proof valid count is `0`

This change does not claim relay transport is release-grade. It hardens the
query path that feeds the release evidence count.

## Change

Added a route-evidence regression test that seeds a stale relay record with
`release_grade=true` but without current relay transport proof. The
`release_grade=true` query must exclude that stale relay record and return only
records that still satisfy the current transport-proof contract.

This protects the hosted release gate from old or manually inserted relay
records inflating the release-grade relay route evidence count.

## Validation

- `npm run test:p2p` passed `61/61`
- `npm run typecheck` passed
- `git diff --check` passed

## Release Interpretation

Public release remains No-Go until a real two-machine relay path records
owner-scoped release-grade route evidence with:

- `route_kind=relay`
- `payload_transited_musu_infra=true`
- stored `musu.relay_transport_proof.v1`
- stored `musu.relay_payload_delivery_proof.v1`
- production release-grade KV/Upstash stores
