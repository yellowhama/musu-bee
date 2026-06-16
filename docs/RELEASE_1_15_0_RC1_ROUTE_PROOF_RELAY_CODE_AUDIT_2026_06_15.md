# RELEASE 1.15.0-rc.1 Route Proof And Relay Code Audit

**Wiki ID**: wiki/1156

Date: 2026-06-15 KST

Scope:

- delegated task route evidence
- Private Mesh callback proof
- rendezvous fallback and relay payload queue boundaries
- release relay tunnel proof claims
- Rust warning/code-health gate

## Verdict

MUSU's current software path is coherent for the Private Mesh thesis, but the
product must keep one boundary precise: the S-grade user path is Headscale-based
Private Mesh first, not a production QUIC relay tunnel yet.

The code now enforces that distinction better than before. The active runtime
path can record LAN/tailnet/direct route evidence, callback proof, and
target-side relay payload delivery evidence. Release-grade relay payload
evidence is accepted only when a bound `quic_relay_tunnel` transport proof,
payload delivery proof, peer identity proof, and `quic_tls_1_3` encryption proof
are attached. The old `rendezvous.rs` release relay submission helper is not a
runtime feature; it is now compiled only for tests, where it proves the intended
future contract remains blocked with
`release_relay_tunnel_runtime_not_implemented`.

Qualitative assessment after this audit:

- Product truthfulness: improved. The code no longer looks like it ships a QUIC
  relay submission runtime when it does not.
- Route/callback proofing: strong for the local software path, still gated by
  physical two-machine evidence.
- Relay fallback: acceptable as preview/diagnostic infrastructure, not
  release-grade default transport.
- Code health: improved from Rust warning debt to warning-free `cargo check`.

## Current Route Contract

The route/proof contract now reads as follows:

1. Direct delegated execution records actual bridge forwarding evidence through
   `record_bridge_forward_route_evidence`.
2. Private Mesh callback reconciliation records
   `musu.callback_proof.v1` and marks local Private Mesh config verified only
   when the route proof confirms a successful tailnet callback.
3. Relay lease fallback may queue a forwarded-task envelope after direct path
   failure, but queued payload transport is not proof of a release-grade relay
   tunnel by itself.
4. Target-side relay drain can accept a claimed payload, deliver it locally,
   mark it delivered, and record relay payload delivery evidence.
5. Release-grade relay evidence requires both payload delivery proof and bound
   relay transport proof. If a `quic_relay_tunnel`/release-grade payload lacks
   transport proof, target delivery fails with
   `release_relay_transport_proof_missing`.
6. The future release relay submission contract remains test-only until a real
   QUIC/TLS relay runtime exists.

## Code Audit Findings

### Fixed: release relay submission placeholder compiled as production code

Evidence before fix:

- `musu-rs/src/bridge/rendezvous.rs` defined
  `ReleaseRelayTunnelSubmissionContract`,
  `release_relay_tunnel_submission_contract`, and
  `submit_release_relay_tunnel_payload`.
- Nothing in the production runtime called those items.
- `cargo check --manifest-path musu-rs\Cargo.toml -p musu-rs` emitted
  dead-code warnings for the constants, struct, functions, and helper.

Risk:

- The code visually implied a production release relay submission path existed.
- The compiler warning made the boundary noisy and easier to ignore.

Fix:

- The release relay submission placeholder is now `#[cfg(test)]`.
- Its tests still prove the future contract is QUIC/TLS-bound and remains
  blocked with `release_relay_tunnel_runtime_not_implemented`.
- Production code no longer compiles a dead relay submission surface.

### Verified: active relay drain rejects release-grade claims without transport proof

Evidence:

- `musu-rs/src/bridge/handlers/relay_payload.rs` owns the active target-side
  drain path.
- `record_target_relay_payload_delivery_route_evidence` calls
  `record_release_relay_payload_delivery_route_evidence` only when cloud
  delivery response includes relay transport proof.
- If the payload/proof is release-grade or uses `quic_relay_tunnel` without a
  transport proof, the code returns `release_relay_transport_proof_missing`.

Result:

- Preview relay delivery can be recorded as preview evidence.
- Release relay evidence cannot be inflated from a store/forward payload alone.

### Verified: callback proof updates Private Mesh evidence only after route proof

Evidence:

- `receive_callback` writes callback proof through
  `record_task_callback_proof`.
- It reads the route proof with `task_route_proof`.
- `mark_callback_verified` is called only when route kind is `tailscale`,
  result is `success`, and callback proof exists.

Result:

- A callback alone is not enough to mark the Private Mesh release proof. It must
  bind back to an already-recorded successful tailnet route.

### Fixed: dead mDNS helper warning

Evidence before fix:

- `musu-rs/src/peer/mdns.rs::auto_register_peers` was a cancellation-free
  wrapper.
- The bridge uses `auto_register_peers_with_cancellation`.
- `cargo check` emitted one remaining dead-code warning after the relay cleanup.

Fix:

- Removed the unused wrapper instead of suppressing the warning.
- The cancellable bridge path remains unchanged.

## Verification

Commands run:

- `cargo test --manifest-path musu-rs\Cargo.toml release_relay --lib -j 1`
  - `7 passed`
- `cargo test --manifest-path musu-rs\Cargo.toml relay_payload --lib -j 1`
  - `32 passed`
- `cargo test --manifest-path musu-rs\Cargo.toml mdns --lib -j 1`
  - `3 passed`
- `cargo check --manifest-path musu-rs\Cargo.toml -p musu-rs`
  - passed with no warnings

## Remaining Risks

- Physical two-machine Private Mesh evidence is still required before claiming
  the network product is fully release-proven.
- Direct CLI `musu mesh create-join-key` now delegates to the generated helper
  under a bounded helper timeout; see wiki/1164.
- Preview relay payload infrastructure is useful for diagnostics and future
  fallback work, but it is not a replacement for the Private Mesh default path.
- A real production relay tunnel still needs a concrete QUIC/TLS runtime,
  peer identity binding, relay server proof emission, and end-to-end dogfood.

## Next Step Plan

1. Run the installed desktop build on two physical machines joined to the
   MUSU-owned Headscale tailnet.
2. Capture `musu mesh verify` in both directions and store route evidence plus
   SHA256 sidecars.
3. Send a Cockpit order from machine A to machine B and verify callback proof
   marks the Private Mesh evidence verified.
4. Keep relay payload fallback labeled preview until a real QUIC relay runtime
   exists and passes the current release proof tests without test-only helpers.

Search terms should include `wiki/1156`, `release_relay_tunnel_runtime_not_implemented`,
`release_relay_transport_proof_missing`, `record_target_relay_payload_delivery_route_evidence`,
`record_release_relay_payload_delivery_route_evidence`, `task_route_proof`,
`record_task_callback_proof`, `auto_register_peers_with_cancellation`, and
`warning-free cargo check`.
