# MUSU 1.15.0-rc.1 Relay Payload Queue Runtime Hook

Date: 2026-06-04
Wiki ID: wiki/652

## Summary

Rust forwarding fallback now enqueues the forwarded-task envelope to the hosted
lease-bound relay payload queue after direct route attempts fail and a
`musu.pro` relay lease is issued.

This is still not release-grade relay transport. The queue proves that the
runtime attempted the fallback payload queue after an issued lease; it does not
prove target-side polling, execution, or QUIC/TLS relay payload transit.

## Runtime Behavior

`musu-rs/src/bridge/handlers/forward.rs` now builds a
`musu.relay_payload_envelope.v1` request from the failed `ForwardedTask`:

- serializes the forwarded-task envelope as JSON
- base64-encodes the payload
- records a SHA-256 hash
- binds the request to the rendezvous `session_id`, relay `lease_id`,
  source node, target node, and generated tunnel id
- posts the request through `MusuCloud::submit_relay_payload(...)`

`musu-rs/src/bridge/rendezvous.rs` now records a
`RelayPayloadQueueOutcome` for the lease-issued fallback path:

- no issued relay lease: `payload_transport_attempted=false`
- queue accepted and stored: `payload_transport_attempted=true`,
  `payload_transport_proven=false`,
  `payload_transport_failure_class=relay_target_polling_not_implemented`
- queue failure: `payload_transport_attempted=true`,
  `payload_transport_proven=false`, and a bounded class such as
  `relay_payload_queue_failed`, `relay_payload_queue_timeout`, or
  `relay_payload_queue_not_stored`

Prompt/payload bytes are not copied into route evidence. Runtime logging only
records queue identifiers, hash, byte count, and bounded status classes.

## Evidence Contract

Issued relay fallback evidence can now distinguish:

- old lease-only gaps:
  `payload_transport_attempted=false`,
  `payload_transport_failure_class=relay_payload_transport_not_implemented`
- new queued fallback preview:
  `payload_transport_attempted=true`,
  `payload_transport_proven=false`,
  `payload_transport_failure_class=relay_target_polling_not_implemented`

Hosted route-evidence grading keeps the queued fallback non-release-grade with
`relay_fallback_payload_transport_not_proven`, but no longer adds the
`relay_fallback_payload_transport_not_attempted` blocker for the queued preview.

## Validation

- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib bridge::handlers::forward::tests:: -j 1`:
  pass, 6/6
- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib bridge::rendezvous::tests:: -j 1`:
  pass, 5/5
- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib cloud::tests:: -j 1`:
  pass, 5/5
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`: pass
- `npm run test:p2p`: pass, 51/51
- `npm run typecheck`: pass
- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check`: pass
- `git diff --check`: pass

## Release Interpretation

Public release remains No-Go.

This change does not make `musu.pro` the default central data path. Direct peer
routes are still attempted first, and relay payload queueing only happens after
direct failure plus an issued relay lease.

The remaining relay work is target-side queue polling/execution and a real
release-grade QUIC/TLS relay/tunnel that emits stored
`musu.relay_transport_proof.v1` and release-grade `route_kind=relay` evidence
after payload bytes transit.

Because runtime source changed, previously captured packaged MSIX/smoke/CPU
evidence is stale for the current source until the MSIX is rebuilt and fresh
primary evidence is recorded.
