# MUSU 1.15.0-rc.1 Relay Payload Queue API

Date: 2026-06-04
Wiki ID: wiki/651

## Summary

Added the first concrete relay payload data-path slice: an owner-scoped,
lease-bound payload queue endpoint on the hosted P2P control plane.

This moves relay fallback beyond audit-only lease/proof records, but it is
still not release-grade QUIC/TLS relay transport. The queue endpoint is an
HTTP/KV-backed preview path for runtime wiring; `relay_payload_endpoint_wired`
and `relay_transport_wired` remain false until target-side relay polling and
release-grade QUIC/TLS payload transport are implemented.

## API

- `POST /api/v1/p2p/relay/payload`
- `GET /api/v1/p2p/relay/payload`

`POST` requires bearer auth and schema `musu.relay_payload_envelope.v1`.

Required fields:

- `session_id`
- `lease_id`
- `source_node_id`
- `target_node_id`
- `tunnel_id`
- `payload_kind`
- `payload_base64`
- optional `payload_sha256`

The route verifies the stored owner-scoped relay lease before accepting a
payload. Missing leases return `409 relay_payload_lease_not_found` without
storing.

Stored records use schema `musu.p2p_relay_payload_store.v1`, TTL expiry, owner
scope, payload SHA-256 validation, `relay_default_data_path=false`, and
`transport_kind=http_store_forward_preview`.

`GET` returns `musu.p2p_relay_payloads.v1`, filters by owner/session/lease/node
IDs/tunnel/status, strips `owner_key`, and omits `payload_base64` unless
`include_payload=1` is explicitly requested.

## Runtime Client

`musu-rs/src/cloud/mod.rs` now includes:

- `P2pRelayPayloadRequest`
- `P2pRelayPayloadResponse`
- `P2pRelayPayloadStoredRecord`
- `MusuCloud::submit_relay_payload(...)`

This gives the bridge fallback runtime a typed client hook for the next step:
after a relay lease is issued, enqueue the forwarded-task envelope and record
that relay payload transport was attempted.

## Validation

- `npx tsx --test src/app/api/v1/p2p/relay/payload/route.test.ts`: pass, 5/5
- `npm run test:p2p`: pass, 50/50
- `npm run typecheck`: pass
- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check`: pass
- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib cloud::tests:: -j 1`:
  pass, 5/5
- `git diff --check`: pass

## Release Interpretation

Public release remains No-Go.

This is not a central default data path. Payload queue records require a
previously issued relay lease, and relay leases still require direct route
failure. The endpoint is deliberately non-release-grade:

- top-level `release_grade=false`
- `release_grade_blockers=["relay_payload_queue_not_quic_tls_transport"]`
- `relay_payload_endpoint_wired=false`
- `relay_transport_wired=false`

The remaining relay work is target-side polling/execution plus a real
QUIC/TLS relay/tunnel that emits stored `musu.relay_transport_proof.v1` and
release-grade `route_kind=relay` route evidence after payload bytes transit.
