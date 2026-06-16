# 2026-06-15 Route Proof And Relay Code Audit

Durable memory for wiki/1156.

The route/proof/relay audit found that MUSU's active runtime path is coherent
but the release relay boundary needed cleanup. `relay_payload.rs` owns the
active target-side drain path and correctly refuses release-grade relay payload
claims without bound transport proof (`release_relay_transport_proof_missing`).
`route_evidence.rs` records release relay evidence only when payload delivery
proof and QUIC/TLS transport proof are both attached. `receive_callback` marks
Private Mesh callback verification only after a successful tailnet route proof
and callback proof are both present.

The production code no longer compiles the unused release relay submission
placeholder from `rendezvous.rs`; that contract is now `#[cfg(test)]`, where it
continues to prove the future QUIC/TLS relay submission path is intentionally
blocked with `release_relay_tunnel_runtime_not_implemented`. The unused
`auto_register_peers` mDNS wrapper was removed; the cancellable bridge path
`auto_register_peers_with_cancellation` remains.

Verification:

- `cargo test --manifest-path musu-rs\Cargo.toml release_relay --lib -j 1`: `7 passed`
- `cargo test --manifest-path musu-rs\Cargo.toml relay_payload --lib -j 1`: `32 passed`
- `cargo test --manifest-path musu-rs\Cargo.toml mdns --lib -j 1`: `3 passed`
- `cargo check --manifest-path musu-rs\Cargo.toml -p musu-rs`: passed with no warnings

Product note: default S-grade network path remains MUSU Private Mesh
(Headscale-controlled tailnet). Preview relay payload infrastructure is not a
production QUIC relay tunnel yet.
