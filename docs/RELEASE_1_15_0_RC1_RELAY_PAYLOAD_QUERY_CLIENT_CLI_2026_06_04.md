# MUSU 1.15.0-rc.1 Relay Payload Query Client CLI

Date: 2026-06-04
Wiki ID: wiki/653

## Summary

Rust now has an on-demand target-side visibility surface for the lease-bound
relay payload queue.

This does not enable background polling and does not execute relay payloads.
It adds the typed query client and `musu relay payloads` CLI needed before a
bounded target-side poll/claim/execute loop can be implemented.

## Runtime/CLI Surface

`musu-rs/src/cloud/mod.rs` now includes:

- `P2pRelayPayloadQuery`
- `P2pRelayPayloadQueryResponse`
- optional `payload_base64` parsing on `P2pRelayPayloadStoredRecord`
- `MusuCloud::query_relay_payloads(...)`

`musu relay payloads` now supports:

- `--json`
- `--limit`
- `--session-id`
- `--lease-id`
- `--source-node-id`
- `--target-node-id`
- `--local-target`
- `--tunnel-id`
- `--status queued|claimed|delivered`
- `--include-payload`

`--local-target` resolves the current local node id and filters
`target_node_id`, which is the on-demand diagnostic path for the future
target-side relay payload poller.

Human text output never prints `payload_base64`; explicit `--include-payload`
only affects JSON output.

## Validation

- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib cloud::tests:: -j 1`:
  pass, 6/6
- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib install::cli_commands::tests::relay_payload -j 1`:
  pass, 2/2
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`: pass
- `cargo run --manifest-path .\musu-rs\Cargo.toml --bin musu -- relay payloads --help`:
  pass; CLI help lists the payload query filters
- `cargo run --manifest-path .\musu-rs\Cargo.toml --bin musu -- relay payloads --json --local-target --status queued --limit 1`:
  command executed and produced `musu.relay_payloads.v1`; live production
  `https://musu.pro/api/v1/p2p/relay/payload` returned 404, so the report was
  correctly `ok=false`
- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check`: pass
- `git diff --check`: pass

## Release Interpretation

Public release remains No-Go.

This is target-side queue visibility only. It deliberately keeps relay payload
processing on-demand until claim/delivery semantics, bounded polling
sleep/backoff/cancellation, payload execution, and release-grade QUIC/TLS
transport proof are implemented.

The local Rust client and CLI are wired, but live `musu.pro` production did not
serve the payload queue route during validation. That live hosted route must be
deployed and owner-scoped before target-side polling evidence can be captured.
