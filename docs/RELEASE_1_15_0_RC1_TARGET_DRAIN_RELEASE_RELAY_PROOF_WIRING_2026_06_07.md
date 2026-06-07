# Release 1.15.0-rc.1 Target Drain Release Relay Proof Wiring

Date: 2026-06-07 19:47 KST

## Summary

The target-side Rust relay payload drain can now consume an attached
`musu.relay_transport_proof.v1` from the relay payload delivery response and
record release-grade relay route evidence with
`record_release_relay_payload_delivery_route_evidence(...)`.

This is still proof-chain wiring only. It does not implement the release relay
payload endpoint, does not remove the local release tunnel
not-implemented branch, and does not prove live MUSU.PRO relay payload byte
transit.

## Changed

- `musu-rs/src/cloud/mod.rs`
  - Adds optional `relay_transport_proof` to
    `P2pRelayPayloadDeliveryResponse`.
  - Adds a regression test parsing a delivered release payload response with a
    bound `musu.relay_transport_proof.v1` and
    `musu.relay_payload_delivery_proof.v1`.

- `musu-rs/src/bridge/handlers/relay_payload.rs`
  - Converts cloud relay transport proof into bridge route-evidence proof.
  - Uses `record_release_relay_payload_delivery_route_evidence(...)` when the
    delivery response carries transport proof.
  - Rejects release-grade payload/delivery proof without transport proof as
    `release_relay_transport_proof_missing`.
  - Keeps preview store-forward delivery on
    `record_relay_payload_delivery_route_evidence(...)`.

- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1`
  - Now audits the target drain for attached transport-proof handling and
    release recorder wiring.

- `scripts/windows/show-musu-pro-p2p-env-status.ps1`
  - Now treats target drain release-proof wiring as part of the source-contract
    readiness check.
  - Still keeps overall status No-Go while the release payload endpoint and
    release tunnel runtime are unimplemented.

## Safety Properties

- The release recorder is called only when the delivery response carries
  transport proof.
- A release-grade payload or delivery proof cannot silently fall back to preview
  evidence when transport proof is missing.
- The preview store-forward queue remains non-release-grade.
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false` remains correct.
- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false` remains correct.

## Validation

Passed:

- `cargo test --manifest-path musu-rs\Cargo.toml relay_payload --lib`
  - `32 passed`
- `cargo test --manifest-path musu-rs\Cargo.toml cloud::tests::relay_payload_delivery_response --lib`
  - `2 passed`
- `cargo test --manifest-path musu-rs\Cargo.toml route_evidence --lib`
  - `17 passed`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-p2p-store-forward-relay-contract.ps1 -Json`
  - `ok=true`, `fail_count=0`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-musu-pro-p2p-env-status.ps1 -SkipGithub -Json`
  - expected `ok=false`
  - `release_relay_tunnel_runtime_source_contract_ready=true`
  - `release_relay_tunnel_runtime_not_implemented_branch_active=true`
  - blockers include missing release payload endpoint, missing release tunnel
    runtime, preview store-forward queue, not logged in live evidence, missing
    live route/transport/payload proof
- `cargo fmt --check --manifest-path musu-rs\Cargo.toml`
- `git diff --check`

## Qualitative Code Audit

No high or medium issue found in this slice.

Low/residual risks:

- This path still depends on a future service/runtime returning a bound
  `relay_transport_proof` in the delivery response.
- The actual `quic_relay_tunnel` byte path is still absent.
- Current live MUSU.PRO evidence is still not logged in and has no live relay
  transport/payload delivery proof.
- Running three Cargo focused tests in parallel caused Windows package/artifact
  lock waits. Future local validation should run Rust focused tests
  sequentially when build cache is cold.

## Release Meaning

Public release remains No-Go on:

- real second-PC route/CPU/matrix evidence;
- live MUSU.PRO P2P/relay evidence;
- release relay payload endpoint implementation;
- local release relay tunnel runtime implementation;
- support mailbox proof;
- Store/Partner Center proof.
