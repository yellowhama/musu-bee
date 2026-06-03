# MUSU 1.15.0-rc.1 Relay Transport Proof Record API

Date: 2026-06-03

## Summary

The hosted P2P control-plane now has an owner-scoped API for relay/tunnel
runtime code to record relay transport proof after real payload transit.

The previous gate made `route_kind=relay` evidence depend on a stored proof, but
there was no hosted route for a future relay runtime to write that proof. This
change adds the write/query surface while keeping the endpoint fail-closed on
missing lease binding and non-release-grade local proof storage.

## API

- `POST /api/v1/p2p/relay/transport-proof`
- `GET /api/v1/p2p/relay/transport-proof`

`POST` requires bearer auth and schema `musu.relay_transport_proof.v1`.

Required proof fields:

- `session_id`
- `lease_id`
- `source_node_id`
- `target_node_id`
- `transport_kind`
- `relay_url`
- `tunnel_id`
- `handshake_ms`
- `payload_bytes_transited`
- `payload_transited_musu_infra`
- `encryption`
- `transport_verified_by`
- `opened_at`
- optional `closed_at`

The API verifies owner-scoped relay lease binding before storing proof:

- owner key from bearer token
- `session_id`
- `lease_id`
- `source_node_id`
- `target_node_id`
- stored lease `relay_url`

`GET` returns schema `musu.p2p_relay_transport_proofs.v1`, owner-scoped records,
proof-store backend fields, and never returns `owner_key`.

## New Blockers

- `relay_transport_proof_lease_not_found`
- `relay_transport_proof_relay_url_mismatch`
- `relay_transport_proof_lease_store_unavailable:<detail>`
- `relay_transport_proof_relay_url_not_wss`
- `relay_transport_proof_kind_not_release_grade`
- `relay_transport_proof_no_infra_transit`
- `relay_transport_proof_not_quic_tls`
- `relay_transport_proof_not_verified`
- `relay_transport_proof_opened_at_invalid`
- `relay_transport_proof_closed_at_invalid`
- `relay_transport_proof_timestamp_order_invalid`
- `relay_transport_proof_store_backend_not_release_grade`

## Rust Runtime Contract

`musu-rs/src/cloud/mod.rs` now includes:

- `P2pRelayTransportProofRequest`
- `P2pRelayTransportProofResponse`
- `P2pRelayTransportProofStoredRecord`
- `MusuCloud::submit_relay_transport_proof(...)`

This gives future relay/tunnel runtime code a typed client path to write proof
after actual payload transit.

## Validation

- `npm run test:p2p`: pass, 45/45
- `npm run typecheck`: pass
- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib cloud::tests:: -j 1`:
  pass, 4/4
- `git diff --check`: pass

## Release Interpretation

This is still not relay payload transport completion.

`/api/v1/relay/connect` remains fail-closed and does not yet move payload bytes.
The public release gate still requires a real QUIC relay/tunnel runtime path
that:

1. obtains a short-lived owner-scoped relay lease,
2. transits payload bytes through MUSU infrastructure,
3. records release-grade transport proof through this API,
4. records matching owner-scoped `route_kind=relay` route evidence.

Because web/Rust source changed, fresh packaged primary smoke/CPU/matrix
evidence is required after this commit before current-source local runtime
evidence is restored.
