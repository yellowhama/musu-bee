# 2026-06-04 Relay Payload Target Drain

Added a bounded request-driven local bridge drain primitive for relay payloads.

Code:

- new local route `POST /api/relay/payloads/drain`
- response schema `musu.relay_payload_drain.v1`
- claims payloads with `MusuCloud::claim_relay_payloads(...)`
- validates claimed `forwarded_task_envelope` bytes, length, SHA-256, target,
  claimant, source, and rendezvous session
- accepts decoded tasks through the existing forwarded-task runner path
- calls `MusuCloud::mark_relay_payload_delivered(...)` only after local
  acceptance
- uses `MUSU_P2P_RELAY_PAYLOAD_DRAIN_TIMEOUT_MS`, default `3000ms`, clamped to
  `250..10000ms`
- clamps manual drain limit to `1..5`

Interpretation:

- This is not a background poller.
- It does not add idle CPU pressure by itself.
- Delivery means accepted by the local task runner, not task completion.
- `musu.pro` remains a control plane/fallback coordinator, not the default data
  path.
- Public release still needs opt-in poller evidence, atomic claim hardening,
  release-grade QUIC/TLS relay proof, and fresh packaged evidence.

Validation:

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml` passed
- `cargo test --manifest-path .\musu-rs\Cargo.toml relay_payload --lib -- --test-threads=1` passed 14/14
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed
- Rust background-loop audit passed with `ok=true`, `fail_count=0`
