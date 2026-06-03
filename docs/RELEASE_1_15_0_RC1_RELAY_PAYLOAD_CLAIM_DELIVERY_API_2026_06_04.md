# MUSU 1.15.0-rc.1 Relay Payload Claim/Delivery API

Date: 2026-06-04
Wiki ID: wiki/654

## Summary

The hosted relay payload queue now has explicit claim and delivery transitions
for the local/development file-backed store:

- `PATCH /api/v1/p2p/relay/payload` with `musu.relay_payload_claim.v1`
- `PATCH /api/v1/p2p/relay/payload` with `musu.relay_payload_delivery.v1`

This adds the API semantics needed before a bounded target-side poller can be
wired. It does not start background polling, execute payloads, or prove
release-grade QUIC/TLS relay transport.

## API Surface

Claim requests are bearer-authenticated and owner-scoped. They claim queued
payloads for a target node and return:

- `musu.p2p_relay_payload_claim.v1`
- `count`
- claimed public payload records
- `relay_default_data_path=false`
- `release_grade=false`

Delivery requests are also bearer-authenticated and owner-scoped. They mark a
claimed payload delivered and return:

- `musu.p2p_relay_payload_delivery.v1`
- the delivered public payload record
- `relay_default_data_path=false`
- `release_grade=false`

Public payload records still strip `owner_key`. Claim responses only include
`payload_base64` when `include_payload=true`. Delivery responses never include
payload bytes.

## Store Semantics

The local/development file store now supports this lifecycle:

```text
queued -> claimed -> delivered
```

Claiming records `claimed_by` and `claimed_at`. Delivery records
`delivered_at`.

Delivery before claim is rejected with:

- HTTP `409`
- `relay_payload_delivery_requires_claim`

2026-06-04 follow-up: wiki/657 added a KV/Upstash list-rewrite mutation path
for claim and delivery, so those placeholder errors are no longer the current
behavior. The KV path remains non-release-grade until concurrent atomic claim
hardening lands.

## Validation

- `npm run test:p2p`: pass, 54/54
- `npm run typecheck`: pass

No Rust source changed in this slice.

## Release Interpretation

Public release remains No-Go.

This is a hosted queue state-transition API, not the relay transport itself.
`musu.pro` remains a P2P control plane and fallback relay coordinator, not the
default central data path. Relay fallback still requires direct path failure and
an issued relay lease before payload queueing is relevant.

Remaining relay blockers include:

- bounded target-side claim/poll/execute loop
- deployed production payload route with release-grade atomic claim/delivery
- release-grade QUIC/TLS relay proof after actual payload transit
- fresh packaged MSIX smoke/CPU/matrix evidence after source changes
