# MUSU 1.15.0-rc.1 Relay Payload Target Drain

Date: 2026-06-04
Wiki ID: wiki/658

## Summary

The local Rust bridge now has a bounded, request-driven target-side relay
payload drain primitive:

- `POST /api/relay/payloads/drain`
- response schema `musu.relay_payload_drain.v1`

The endpoint claims owner-scoped relay payload queue records for the local
target node, decodes claimed `forwarded_task_envelope` payloads, accepts them
through the existing local forwarded-task path, and only then acknowledges
delivery back to `musu.pro`.

This is deliberately not a background polling loop. It adds no idle target-side
poller and must remain request-driven until an opt-in poller has separate
sleep, backoff, cancellation, and CPU evidence.

## Runtime Behavior

The drain request supports optional filters:

- `session_id`
- `lease_id`
- `source_node_id`
- `tunnel_id`
- `limit`

`limit` defaults to `1` and is clamped to `1..5` so manual drains cannot create
an unbounded local work burst. Cloud claim and delivery calls use
`MUSU_P2P_RELAY_PAYLOAD_DRAIN_TIMEOUT_MS`, defaulting to `3000ms` and clamped
to `250..10000ms`.

For each claimed payload, the bridge verifies:

- payload status is `claimed`
- claimed target matches the local node
- `claimed_by`, when present, matches the local node
- payload kind is `forwarded_task_envelope`
- `payload_base64` is present and decodes
- decoded byte length matches `payload_bytes`
- decoded SHA-256 matches `payload_sha256`
- decoded JSON is a `ForwardedTask`
- source node and rendezvous session match the stored record
- embedded target node, when present, matches the stored target node

After validation, the bridge calls the same local task acceptance path used by
`POST /api/tasks/forward`. Delivery is marked only after the task is accepted
into the local task runner. This is delivery-to-local-runner proof, not proof
that the task completed.

## Validation

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml`: pass
- `cargo test --manifest-path .\musu-rs\Cargo.toml relay_payload --lib -- --test-threads=1`: pass, 14/14
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`: pass
- `scripts\windows\audit-rust-background-loop-contract.ps1 -Json`: pass,
  `ok=true`, `fail_count=0`, `unaudited_loop_hit_count=0`

## Release Interpretation

Public release remains No-Go.

This closes part of the target-side relay payload gap by adding manual,
bounded claim/decode/accept/delivery plumbing. It does not yet provide:

- opt-in background target polling with sleep/backoff/cancellation evidence
- release-grade concurrent atomic claim semantics
- release-grade QUIC/TLS relay payload transport proof
- hosted production evidence that queued payloads transit through the fallback
- fresh packaged MSIX smoke/CPU/matrix evidence after this source change

`musu.pro` remains a P2P control plane and fallback coordinator, not the default
central data path.
