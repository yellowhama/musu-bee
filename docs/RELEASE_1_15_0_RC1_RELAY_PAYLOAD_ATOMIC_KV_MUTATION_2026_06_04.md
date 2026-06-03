# MUSU 1.15.0-rc.1 Relay Payload Atomic KV Mutation

Date: 2026-06-04
Wiki ID: wiki/660

## Summary

The hosted KV/Upstash relay payload queue now uses atomic Redis Lua mutations
for payload append, claim, and delivery.

This replaces the previous app-level mutation pattern:

- `lrange`
- mutate in the Next.js process
- rewrite retained records with `del` plus `rpush`

That previous pattern could allow two concurrent target claimers to observe the
same queued payload before either rewrite completed.

## Store Behavior

The KV path now:

- appends payloads with a single Redis `EVAL`
- claims queued payloads with a single Redis `EVAL`
- marks claimed payloads delivered with a single Redis `EVAL`
- preserves owner scoping, target-node matching, and optional session/lease/
  source/tunnel filters
- rejects delivery before claim with `relay_payload_delivery_requires_claim`
- no longer uses app-level `del`/`rpush` list rewrites for mutation
- reports `relay_payload_store_release_grade=true` when KV/Upstash is
  configured

The payload record itself remains:

- `relay_default_data_path=false`
- `release_grade=false`
- `transport_kind=http_store_forward_preview`

## Validation

- `npx tsx --test src/app/api/v1/p2p/relay/payload/route.test.ts`: pass, 11/11
- `npm run test:p2p`: pass, 57/57
- `npm run typecheck`: pass

The new KV test double simulates the Lua mutation contract and asserts that two
concurrent claims cannot both claim the same queued payload. It also asserts the
old app-level `del`/`rpush` rewrite path is not used by KV append, claim, or
delivery.

## Release Interpretation

Public release remains No-Go.

This closes the production concurrent claim hardening blocker for the hosted
relay payload queue store. It does not implement release-grade QUIC/TLS relay
payload transport, does not make `musu.pro` the default data path, and does not
produce hosted relay transport proof.

Remaining relay blockers include:

- release-grade QUIC/TLS relay payload transit
- hosted relay transport proof after actual payload transit
- fresh packaged MSIX smoke/CPU/matrix evidence after source changes
- second-PC runtime and route evidence
- support mailbox evidence
- Store certification evidence
