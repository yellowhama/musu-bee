# MUSU 1.15.0-rc.1 Relay Transport Proof Gate

**Wiki ID**: wiki/614

Date: 2026-06-03 13:50 KST

## Scope

Hosted P2P route evidence now requires explicit relay payload transport proof
before a `route_kind=relay` record can become release-grade.

This closes the remaining lease-only gap in the route-evidence API. A relay
record can no longer pass by presenting only:

- `route_kind=relay`
- `payload_transited_musu_infra=true`
- release-grade top-level encryption fields
- an owner-scoped stored relay lease

It must also include `relay_transport_proof`.

## New Proof Contract

`POST /api/v1/p2p/route-evidence` accepts an optional
`relay_transport_proof` object with schema:

```json
{
  "schema": "musu.relay_transport_proof.v1",
  "session_id": "rv_...",
  "lease_id": "relay-lease-...",
  "transport_kind": "quic_relay_tunnel",
  "relay_url": "wss://relay.musu.pro/connect",
  "tunnel_id": "relay-tunnel-...",
  "handshake_ms": 23,
  "payload_bytes_transited": 128,
  "payload_transited_musu_infra": true,
  "encryption": "quic_tls_1_3",
  "transport_verified_by": "musu_quic_tls_transport",
  "opened_at": "2026-06-03T13:50:00Z",
  "closed_at": "2026-06-03T13:50:01Z"
}
```

For `route_kind=relay`, release grading now fails unless:

- `relay_transport_proof` is present
- proof `lease_id` matches `relay_fallback.lease_id`
- proof `session_id` matches the route evidence `session_id`
- proof `relay_url` starts with `wss://`
- proof `payload_transited_musu_infra=true`
- proof `payload_bytes_transited > 0`
- proof `encryption=quic_tls_1_3`
- proof `transport_verified_by=musu_quic_tls_transport`

New blockers include:

- `relay_route_missing_transport_proof`
- `relay_route_transport_proof_lease_mismatch`
- `relay_route_transport_proof_session_mismatch`
- `relay_route_transport_proof_relay_url_not_wss`
- `relay_route_transport_proof_no_infra_transit`
- `relay_route_transport_proof_not_quic_tls`
- `relay_route_transport_proof_not_verified`

Stored route evidence queries with `release_grade=true` now also exclude older
relay records that lack the current `musu.relay_transport_proof.v1` proof,
even if a stale stored record previously had `release_grade=true`.

## Rust DTO Alignment

`musu-rs/src/cloud/mod.rs` now includes `RouteRelayTransportProof` and
`RouteEvidence.relay_transport_proof`, so future relay runtime code can submit
the same proof contract. Existing direct-route evidence continues to serialize
without that field.

`musu-rs/src/bridge/route_evidence.rs` explicitly submits `None` for current
direct/legacy forwarding paths. That is intentional: current runtime
forwarding does not carry relay payload transport.

## Validation

- `npm run test:p2p`: 35/35
- `npm run typecheck`: passed
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`: passed
- `cargo fmt --manifest-path .\musu-rs\Cargo.toml`: passed
- `cargo test --manifest-path .\musu-rs\Cargo.toml cloud::tests::route_evidence_serializes_required_contract_fields --lib -j 1`: passed
- `scripts/windows/test-release-evidence-verifiers.ps1 -Json`: 20/20
- `git diff --check`: passed

## Release Interpretation

This is a release-grade evidence hardening gate, not relay/tunnel payload
transport implementation.

Public release still requires real relay/tunnel payload transport to generate
`musu.relay_transport_proof.v1` from an actual route, plus live owner-scoped
`musu.pro` KV/Upstash storage and release-grade relay route evidence with
count greater than zero. Because web and Rust source changed, current packaged
MSIX/smoke/CPU/matrix evidence must be refreshed after this commit.
