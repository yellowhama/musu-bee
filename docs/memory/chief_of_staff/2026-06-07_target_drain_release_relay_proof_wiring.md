# 2026-06-07 Target Drain Release Relay Proof Wiring

Rust target-side relay payload drain now has a source path from delivery
response `relay_transport_proof` to release route evidence recording.

Durable details:

- `P2pRelayPayloadDeliveryResponse` includes optional
  `relay_transport_proof: Option<RouteRelayTransportProof>`.
- `record_target_relay_payload_delivery_route_evidence(...)` calls
  `record_release_relay_payload_delivery_route_evidence(...)` only when the
  delivery response carries bound transport proof.
- Release-grade payload or delivery proof without transport proof fails as
  `release_relay_transport_proof_missing` instead of silently falling back to
  preview evidence.
- Preview store-forward delivery still uses
  `record_relay_payload_delivery_route_evidence(...)`.
- Release markers remain false:
  `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`,
  `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`.

Validation:

- `cargo test --manifest-path musu-rs\Cargo.toml relay_payload --lib`:
  `32 passed`
- `cargo test --manifest-path musu-rs\Cargo.toml cloud::tests::relay_payload_delivery_response --lib`:
  `2 passed`
- `cargo test --manifest-path musu-rs\Cargo.toml route_evidence --lib`:
  `17 passed`
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`
- P2P env status expected No-Go with `source_contract_ready=true` and runtime
  not-implemented branch still active

Canonical report:

- `docs\RELEASE_1_15_0_RC1_TARGET_DRAIN_RELEASE_RELAY_PROOF_WIRING_2026_06_07.md`
