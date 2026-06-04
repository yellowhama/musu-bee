# MUSU 1.15.0-rc.1 Relay Connect and Queue Status Split

Date: 2026-06-04

## Summary

Relay status now separates three different concepts that were easy to confuse:

- `relay_connect_endpoint_wired`: whether `/api/v1/relay/connect` is a real
  relay/tunnel payload endpoint.
- `relay_payload_endpoint_wired`: the release-gate payload endpoint marker,
  still tied to the real relay/tunnel connect endpoint.
- `relay_payload_queue_endpoint_wired`: whether the non-release-grade
  lease-bound preview queue/claim/delivery surface is present.

Current source reports the preview queue as wired, while keeping the release
relay/tunnel endpoint unwired:

- `relay_connect_endpoint_wired=false`
- `relay_payload_endpoint_wired=false`
- `relay_payload_queue_endpoint_wired=true`
- `relay_transport_wired=false`
- `relay_default_data_path=false`

This preserves the fail-closed release gate. It makes progress visible without
claiming that the release-grade relay transport exists.

## Change

Updated hosted relay status responses:

- `GET /api/v1/p2p/relay/transport`
- `GET/POST /api/v1/p2p/relay/lease`
- `GET/POST /api/v1/relay/connect` fail-closed response

Updated Rust client/operator surfaces:

- `P2pRelayTransportResponse`
- `musu relay status --json`
- `musu relay transport --json`

Updated evidence recorder summary/result fields:

- `relay_status_connect_endpoint_wired`
- `relay_status_payload_queue_endpoint_wired`
- `relay_transport_connect_endpoint_wired`
- `relay_transport_payload_queue_endpoint_wired`

## Validation

- `npm run test:p2p` passed `62/62`
- `npm run typecheck` passed
- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check` passed
- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib install::cli_commands::tests::relay_status_reflects_live_transport_descriptor -j 1` passed `1/1`
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed
- PowerShell parser check passed for `record-p2p-control-plane-evidence.ps1`
- `git diff --check` passed

## Release Impact

This does not close the hosted P2P control-plane blocker. It clarifies the
blocker.

Public release still requires:

- production KV/Upstash relay storage
- real `/api/v1/relay/connect` relay/tunnel payload transport
- release-grade `musu.relay_transport_proof.v1`
- owner-scoped release-grade relay route evidence
- relay payload delivery proof tied to stored delivered payloads
- current second-PC route/CPU/matrix evidence
- support mailbox evidence
- Store/Partner Center evidence

Because this changes runtime/web/Rust source, fresh packaged primary evidence is
required after commit before current-source local artifact readiness can be
claimed again.
