# MUSU 1.15.0-rc.1 Relay Payload Delivery Proof Release Metadata

**Wiki ID**: wiki/835
**Date**: 2026-06-06

## Summary

Relay payload delivery proof now carries release transport metadata and route
evidence rejects preview queue delivery proof as release-grade evidence.

Added required proof fields:

- `relay_url`
- `transport_kind`
- `relay_default_data_path`
- `release_grade`

The release route verifier now requires payload delivery proof to use
`transport_kind=quic_relay_tunnel`, `release_grade=true`,
`relay_default_data_path=false`, and a `wss://` relay URL matching the route
transport proof. Stored payload records must also match those release metadata
fields. Preview queue records remain `release_grade=false` with
`transport_kind=http_store_forward_preview`, so they can be recorded and drained
but cannot satisfy hosted P2P release evidence.

## Code Changes

Web/control-plane:

- `p2pRelayPayloadStore.ts`
  - delivery proof now includes relay URL, transport kind, release grade, and
    default-data-path metadata from the stored payload record
  - stored payload type now allows future release tunnel records while current
    preview creation still emits non-release-grade queue records
- `route-evidence/route.ts`
  - route evidence schema requires delivery proof release metadata
  - release blockers now reject preview transport kind, non-release delivery
    proof, mismatched relay URL, and non-release stored payload records
- `routeEvidenceStore.ts`
  - release-grade query filtering now revalidates delivery proof release
    metadata, not only session/lease/source/target/tunnel/hash fields

Rust/runtime:

- `RouteRelayPayloadDeliveryProof` in bridge and cloud DTOs now carries the
  same release metadata fields.
- Target-side relay payload drain proof creation preserves the stored payload
  release metadata instead of emitting a weaker proof shape.

Verifier/audit:

- `verify-p2p-control-plane-evidence.ps1` rejects relay route evidence when
  payload delivery proof uses preview/store-forward transport metadata.
- `test-release-evidence-verifiers.ps1` adds
  `p2p rejects relay route evidence with preview payload delivery proof
  transport`.
- `audit-p2p-store-forward-relay-contract.ps1` gates the source contract.

## Qualitative Evaluation

No high or medium issue was found.

This closes a proof-boundary gap. Before this change, route evidence checked
that a delivery proof matched the same session, lease, source, target, tunnel,
hash, byte count, and delivered timestamp. It did not require the delivery
proof or the stored payload record to prove that the payload was delivered via
the release relay tunnel rather than the preview store-forward queue.

The current product boundary remains unchanged:

- MUSU Desktop remains the local executor.
- MUSU.PRO remains remote input, room, rendezvous, path-selection,
  relay-fallback policy, and evidence/control plane.
- The preview store-forward queue can support fallback experimentation, but it
  cannot be marketed or counted as release-grade relay tunnel transport.

## Validation

Passed:

- PowerShell parser checks for changed verifier/audit scripts
- `npm run test:p2p -- --test-name-pattern "relay payload|route evidence|P2P route evidence"`
  - `105/105`
- `npm run typecheck`
- `cargo fmt --check`
- `cargo check --lib`
- `cargo test --lib route_evidence`
  - `14 passed`
- `cargo test --lib relay_payload`
  - `24 passed`
- `audit-p2p-store-forward-relay-contract.ps1 -Json`
  - `ok=true`
  - `fail_count=0`
- `test-release-evidence-verifiers.ps1 -Json`
  - `ok=true`
  - `case_count=64`
  - `failed_case_count=0`
- `git diff --check`

## Remaining Blockers

Public release remains No-Go on:

- real second-PC route evidence
- second-PC idle CPU and runtime CPU scenario matrix evidence
- production KV/Upstash env and live runtime login proof
- missing release relay tunnel payload endpoint
- live relay route transport proof and release relay payload delivery proof
- support mailbox evidence
- Microsoft Partner Center / Store evidence

## Next Step Document

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_RELAY_PAYLOAD_DELIVERY_PROOF_RELEASE_METADATA_2026_06_06.md`
