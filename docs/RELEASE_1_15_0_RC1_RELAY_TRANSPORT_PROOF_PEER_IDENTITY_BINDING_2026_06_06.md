# MUSU 1.15.0-rc.1 Relay Transport Proof Peer Identity Binding

**Wiki ID**: wiki/833
**Date**: 2026-06-06

## Summary

Release relay transport proof now carries peer identity binding fields directly
inside `musu.relay_transport_proof.v1`.

Added required proof fields:

- `peer_identity_verified`
- `peer_identity_method`
- `peer_public_key`

The release-grade path now requires the relay transport proof identity fields
to match the route evidence top-level peer identity fields. This prevents a
stored relay transport proof from being reused with a different route identity
claim.

This is proof-contract hardening. It does not implement the missing release
relay tunnel payload endpoint and does not change MUSU.PRO into the executor.

## Code Changes

Web/control-plane:

- `musu-bee/src/app/api/v1/p2p/relay/transport-proof/route.ts`
  - requires peer identity fields in the strict proof schema
  - rejects non-release peer identity methods and non-`sha256:` public keys
- `musu-bee/src/lib/p2pRelayTransportProofStore.ts`
  - stores peer identity fields with proof records
  - includes peer identity in `release_grade` calculation
- `musu-bee/src/app/api/v1/p2p/route-evidence/route.ts`
  - requires relay transport proof identity to match route evidence identity
  - checks stored proof identity when backing route evidence
- `musu-bee/src/lib/routeEvidenceStore.ts`
  - filters stale release-grade relay records unless the proof identity matches
    current route evidence identity

Rust/runtime DTOs:

- `musu-rs/src/bridge/route_evidence.rs`
  - adds peer identity fields to `RouteRelayTransportProof`
  - preserves those fields in cloud route evidence mapping
- `musu-rs/src/cloud/mod.rs`
  - adds the fields to `RouteRelayTransportProof`,
    `P2pRelayTransportProofRequest`, and
    `P2pRelayTransportProofStoredRecord`

Verifier/audit:

- `verify-p2p-control-plane-evidence.ps1`
  - rejects relay route evidence unless proof identity matches route identity
- `test-release-evidence-verifiers.ps1`
  - adds a bad fixture for relay transport proof identity mismatch
- `audit-p2p-store-forward-relay-contract.ps1`
  - gates the new peer identity proof strings across web/Rust/test surfaces

## Qualitative Evaluation

No high or medium issue was found.

This closes a real proof-integrity gap. Before this change, the route evidence
record carried peer identity, and relay transport proof carried source/target
node IDs plus tunnel/encryption metadata, but the proof record itself did not
bind the peer identity material. The final hosted P2P gate needs evidence that
the same identity claim, relay tunnel, lease, session, source, and target are
bound together.

The change is intentionally conservative:

- release proof still requires `quic_relay_tunnel`
- release encryption still requires `quic_tls_1_3`
- peer identity method must be `quic_tls_cert_fingerprint`
- peer public key must be a `sha256:` fingerprint value
- old or incomplete stored transport proof records no longer count as current
  release-grade relay proof

## Validation

Passed:

- PowerShell parser checks for changed verifier/audit scripts
- `npm run test:p2p -- --test-name-pattern "relay transport proof|route evidence|P2P route evidence"`
  - `105/105`
- `npm run typecheck`
- `cargo check --lib`
- `cargo fmt --check`
- `cargo test --lib route_evidence`
  - `14 passed`
- `audit-p2p-store-forward-relay-contract.ps1 -Json`
  - `ok=true`
  - `fail_count=0`
- `test-release-evidence-verifiers.ps1 -Json`
  - `ok=true`
  - `case_count=63`
  - `failed_case_count=0`
- `git diff --check`

## Product Spec Impact

MUSU.PRO remains the remote input, room, rendezvous, path-selection,
relay-fallback, and evidence/control plane. MUSU Desktop remains the local
executor.

For hosted P2P release proof, a relay route is not enough unless it has:

- owner-scoped relay lease
- direct-path failure before relay fallback
- `quic_relay_tunnel` transport proof
- `quic_tls_1_3` encryption proof
- peer identity proof bound to the relay transport proof
- payload delivery proof bound to the same session/lease/source/target/tunnel

## Remaining Blockers

Public release remains No-Go on:

- real second-PC route evidence
- second-PC idle CPU and runtime CPU scenario matrix evidence
- production KV/Upstash env and live runtime login proof
- missing release relay tunnel payload endpoint
- live relay route transport proof and relay payload delivery proof
- support mailbox evidence
- Microsoft Partner Center / Store evidence

## Next Step Document

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_RELAY_TRANSPORT_PROOF_PEER_IDENTITY_BINDING_2026_06_06.md`
