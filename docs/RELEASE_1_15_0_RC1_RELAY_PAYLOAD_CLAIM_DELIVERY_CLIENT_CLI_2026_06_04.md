# MUSU 1.15.0-rc.1 Relay Payload Claim/Delivery Client CLI

Date: 2026-06-04
Wiki ID: wiki/655

## Summary

Rust now has the manual target-side client/CLI surface for the relay payload
claim and delivery API:

- `P2pRelayPayloadClaimRequest`
- `P2pRelayPayloadClaimResponse`
- `P2pRelayPayloadDeliveryRequest`
- `P2pRelayPayloadDeliveryResponse`
- `MusuCloud::claim_relay_payloads(...)`
- `MusuCloud::mark_relay_payload_delivered(...)`
- `musu relay payload-claim`
- `musu relay payload-deliver`

This is the next step toward target-side relay fallback handling, but it is
still on-demand. It does not start a background poller, execute payloads, or
prove release-grade QUIC/TLS relay transport.

## CLI Surface

`musu relay payload-claim` supports:

- `--json`
- `--limit`
- `--session-id`
- `--lease-id`
- `--source-node-id`
- `--target-node-id`
- `--local-target`
- `--tunnel-id`
- `--include-payload`

`musu relay payload-deliver` supports:

- `--json`
- `<payload-id>`
- `--target-node-id`
- `--local-target`

Both commands require an explicit target through `--target-node-id` or
`--local-target`. Text output continues to omit payload bytes; claim JSON only
prints bytes when `--include-payload` is set.

## Validation

- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib cloud::tests:: -j 1`:
  pass, 10/10
- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib install::cli_commands::tests::relay_payload -j 1`:
  pass, 4/4
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`: pass
- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check`: pass
- `cargo run --manifest-path .\musu-rs\Cargo.toml --bin musu -- relay payload-claim --help`:
  pass; help lists target filters and `--include-payload`
- `cargo run --manifest-path .\musu-rs\Cargo.toml --bin musu -- relay payload-deliver --help`:
  pass; help lists payload id and target filters

No live mutation smoke was run against production, because claiming or
delivering real queued payloads is a state-changing operation.

## Release Interpretation

Public release remains No-Go.

This wires the Rust client and manual CLI diagnostics needed before a bounded
target-side poll/claim/execute loop can be implemented. It deliberately avoids
background polling to protect the idle CPU goal.

Remaining relay blockers include:

- bounded target-side polling with sleep/backoff/cancellation
- payload decode/execution safety
- production release-grade atomic claim/delivery for KV/Upstash
- release-grade QUIC/TLS relay proof after actual payload transit
- fresh packaged MSIX smoke/CPU/matrix evidence after source changes
