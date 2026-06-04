# MUSU 1.15.0-rc.1 Relay Payload Drain Route Evidence

Date: 2026-06-04
Wiki: 663

## Summary

Target-side relay payload drain now carries delivery proof into route evidence.

Before this change, the target drain could claim a queued relay payload, accept
the forwarded task locally, mark the payload delivered, and expose
`musu.relay_payload_delivery_proof.v1` in the drain response. That proof did not
become `musu.pro` route evidence, and the local route-evidence builder could
not create a truthful `route_kind=relay` record because route kind was derived
only from endpoint address.

## Changes

- Added `record_relay_payload_delivery_route_evidence(...)` in Rust route
  evidence.
- Relay delivery route evidence now records:
  - `route_kind=relay`
  - `payload_transited_musu_infra=true`
  - `result=success`
  - `relay_fallback.status=issued`
  - `relay_fallback.payload_transport_attempted=true`
  - `relay_fallback.payload_transport_proven=true`
  - `relay_payload_delivery_proof`
- Target-side relay payload drain now writes local route evidence and attempts
  bounded submit to `musu.pro` after delivery proof is confirmed.
- Drain response items now report:
  - `route_evidence_recorded`
  - `route_evidence_submitted`
  - `route_evidence_path`
  - `route_evidence_failure_class`
- Drain `ok=true` now requires accepted payloads to be delivered and have route
  evidence recorded/submitted.
- `RouteEvidencePayload` TypeScript type now includes
  `relay_payload_delivery_proof`.

## Release Interpretation

This is still not release-grade relay transport. The submitted evidence remains
non-release-grade until real QUIC/TLS relay transport proof is attached and
production `musu.pro` relay transport/KV proof stores are configured.

It does close a proof-chain gap: once a target accepts and acknowledges a
queued relay payload, the runtime can now produce hosted relay route evidence
instead of only returning a local drain report.

## Validation

- `cargo fmt --manifest-path musu-rs\Cargo.toml`
- `cargo test --manifest-path musu-rs\Cargo.toml --lib -j 1 relay_payload`
  passed `24/24`
- `cargo test --manifest-path musu-rs\Cargo.toml --lib -j 1 route_evidence`
  passed `13/13`
- `cargo check --manifest-path musu-rs\Cargo.toml --bin musu -j 1`
- `npm run typecheck`
- `npx tsx --test src\app\api\v1\p2p\route-evidence\route.test.ts`
  passed `22/22`
- `git diff --check`
