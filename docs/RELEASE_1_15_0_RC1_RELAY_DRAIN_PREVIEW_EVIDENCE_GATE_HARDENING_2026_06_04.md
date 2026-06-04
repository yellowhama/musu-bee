# MUSU 1.15.0-rc.1 Relay Drain Preview Evidence Gate Hardening

Date: 2026-06-04

## Summary

The hosted route-evidence tests now explicitly prove that target-side relay
payload drain preview evidence cannot become release-grade relay transport
evidence.

The Rust target drain can record relay route evidence with:

- `route_kind=relay`
- `payload_transited_musu_infra=true`
- `relay_fallback.payload_transport_proven=true`
- `relay_payload_delivery_proof`
- `transport_verified_by=musu_relay_payload_drain_preview`
- `encryption=relay_payload_queue_preview`

That evidence is useful for proving the preview queue/claim/delivery path, but
it is still not the requested public release relay transport. The release gate
must continue to require QUIC/TLS transport proof and the wired relay payload
endpoint.

## Change

Added a route-evidence regression test:

- `keeps target-drain preview relay evidence non release grade even with delivery proof`

The test seeds:

- an owner-scoped relay lease
- a delivered relay payload in the payload store
- a matching `musu.relay_payload_delivery_proof.v1`
- a relay route evidence record shaped like target-drain preview output

It verifies that the hosted API keeps the record non-release-grade and preserves
the correct blockers:

- `transport_not_release_grade_quic_tls`
- `relay_route_missing_transport_proof`
- `relay_route_transport_not_wired`
- `relay_route_payload_endpoint_not_wired`

It also verifies that the delivery proof itself is not falsely rejected:

- no `relay_fallback_payload_delivery_proof_missing`
- no `relay_fallback_payload_delivery_proof_not_stored`

## Validation

- `npm run test:p2p` passed `62/62`
- `npm run typecheck` passed
- `git diff --check` passed

## Release Impact

This is evidence-gate hardening only. It does not implement the release-grade
relay/tunnel payload transport and does not close the hosted `musu.pro` P2P
gate.

Public release still requires:

- current second-PC route/CPU/matrix evidence
- hosted KV/Upstash relay stores
- wired release-grade relay payload endpoint
- stored QUIC/TLS relay transport proof
- owner-scoped release-grade relay route evidence
- relay payload delivery proof
- support mailbox evidence
- Store/Partner Center evidence
