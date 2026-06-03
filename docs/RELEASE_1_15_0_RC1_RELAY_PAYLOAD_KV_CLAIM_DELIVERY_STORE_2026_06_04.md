# MUSU 1.15.0-rc.1 Relay Payload KV Claim/Delivery Store

Date: 2026-06-04
Wiki ID: wiki/657

## Summary

The hosted relay payload queue no longer fails closed for KV/Upstash
claim/delivery. `p2pRelayPayloadStore` now supports owner-scoped
`queued -> claimed -> delivered` transitions on the KV-backed list store as well
as the local/development file store.

This removes the placeholder errors:

- `relay_payload_claim_kv_not_implemented`
- `relay_payload_delivery_kv_not_implemented`

## Store Behavior

The KV path now:

- loads fresh payload records with `lrange`
- applies the same claim/delivery state transition logic as the file store
- rewrites the retained list with `del` plus `rpush`
- preserves owner scoping and target-node matching
- rejects delivery before claim with `relay_payload_delivery_requires_claim`
- keeps `relay_default_data_path=false`
- keeps `release_grade=false`

The list rewrite is intentionally not marked release-grade atomic. A later
hardening slice still needs an Upstash transaction/Lua-style compare-and-set or
an item-key schema before this can be treated as a release-grade concurrent
claim primitive.

## Validation

- `npx tsx --test src/app/api/v1/p2p/relay/payload/route.test.ts`: pass, 10/10
- `npm run test:p2p`: pass, 56/56
- `npm run typecheck`: pass

The KV tests use a fake KV client and do not touch live Upstash or production
`musu.pro`.

## Release Interpretation

Public release remains No-Go.

This is a hosted storage capability improvement for the fallback relay payload
queue. It does not start background polling, execute payloads, prove QUIC/TLS
relay transport, or make `musu.pro` the default data path.

Remaining relay blockers include:

- bounded target-side polling with sleep/backoff/cancellation
- payload decode/execution safety
- release-grade concurrent claim semantics
- release-grade QUIC/TLS relay proof after actual payload transit
- fresh packaged MSIX smoke/CPU/matrix evidence after source changes
