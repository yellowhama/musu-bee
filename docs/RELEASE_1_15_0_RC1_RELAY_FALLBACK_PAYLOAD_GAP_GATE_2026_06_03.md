# MUSU 1.15.0-rc.1 Relay Fallback Payload Gap Gate

**Wiki ID**: wiki/644

Date: 2026-06-03 22:09 KST

## Summary

Runtime relay fallback evidence now records the payload transport gap
explicitly. When the bridge requests a relay lease after terminal direct-route
failure, an issued lease is no longer only represented as `status=issued` and
`lease_issued=true`. The evidence also records:

- `payload_transport_attempted=false`
- `payload_transport_proven=false`
- `payload_transport_failure_class=relay_payload_transport_not_implemented`

This keeps relay lease issuance separate from payload transit. `musu.pro` can
remain the P2P control plane and lease policy boundary without being mistaken
for a working relay data path.

## Changes

- `musu-rs/src/bridge/route_evidence.rs` adds relay fallback payload transport
  state fields and maps them into the cloud DTO.
- `musu-rs/src/bridge/handlers/forward.rs` sets the payload transport gap when
  `RelayLeaseFallbackStatus::Issued` is observed, because current runtime code
  still does not attempt relay payload transport after receiving a lease.
- `musu-rs/src/cloud/mod.rs` accepts the new relay fallback fields with
  backwards-compatible `serde(default)` booleans.
- `musu-bee/src/app/api/v1/p2p/route-evidence/route.ts` treats an issued relay
  fallback without payload transport attempt/proof as non-release-grade.
- `musu-bee/src/lib/routeEvidenceStore.ts` and route-evidence tests preserve
  the new stored evidence fields.

New route-evidence blockers:

- `relay_fallback_payload_transport_not_attempted`
- `relay_fallback_payload_transport_not_proven`
- `relay_fallback_payload_transport_not_implemented`

## Validation

- `git diff --check`: passed
- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check`: passed
- `npm run test:p2p`: `38/38`
- `npm run typecheck`: passed
- `cargo check --manifest-path .\musu-rs\Cargo.toml --lib -j 1`: passed
- `cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 --lib route_evidence -- --nocapture`: `10/10`

## Release Interpretation

This is evidence and release-gate hardening, not relay/tunnel payload transport
implementation.

Public release remains No-Go until real relay/tunnel payload transport produces
release-grade route evidence with `musu.relay_transport_proof.v1`, plus the
existing second-PC runtime/multi-device evidence, support mailbox evidence, and
Store evidence.

Because this changes Rust runtime and hosted route-evidence source, the current
primary packaged MSIX/smoke/CPU/matrix evidence is historical until a fresh
clean post-commit evidence refresh is captured.
