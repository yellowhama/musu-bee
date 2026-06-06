# 1.15.0-rc.1 P2P Route Record Metadata Gate

Date: 2026-06-06 KST

## Summary

Hosted MUSU.PRO P2P release evidence now requires the returned relay route
record itself to contain release-grade route metadata. A valid
`relay_transport_proof` is no longer enough if the enclosing
`musu.route_evidence.v1` record omits the candidate, latency, handshake, peer
identity, encryption, or transport verifier fields.

`verify-p2p-control-plane-evidence.ps1` now checks every returned relay success
record where `route_kind=relay`, `result=success`, and
`payload_transited_musu_infra=true`.

Required route-record metadata:

- `schema=musu.route_evidence.v1`
- non-empty `candidate_addr`
- numeric `handshake_ms >= 0`
- numeric `total_attempt_ms >= handshake_ms`
- `peer_identity_verified=true`
- `peer_identity_method=quic_tls_cert_fingerprint`
- `peer_public_key` starting with `sha256:`
- `encryption=quic_tls_1_3`
- `transport_verified_by=musu_quic_tls_transport`
- valid `recorded_at`

The relay transport proof handshake must also match the route record
`handshake_ms`. This binds the route-level timing to the proof-level timing.

## Output Contract

The hosted P2P verifier now reports:

- `relay_route_metadata_required_count`
- `relay_route_metadata_valid_count`
- `relay_route_metadata_invalid_count`

A new check named `relay route metadata coverage` fails if any returned relay
success record lacks the required route metadata.

## Regression Coverage

`test-release-evidence-verifiers.ps1` now includes:

- source contract: `P2P verifier requires route record metadata`
- negative fixture: `p2p rejects relay route evidence without record latency metadata`
- negative fixture: `p2p rejects relay route evidence with unverified record identity metadata`
- negative fixture: `p2p rejects relay route evidence with transport proof handshake mismatch`

## Validation

- PowerShell parser checks: pass
- release evidence verifier regression:
  - `ok=true`
  - `case_count=81`
  - `failed_case_count=0`
  - output root:
    `.local-build\release-evidence-verifier-tests\20260606-221906`
- direct valid fixture check:
  - `ok=true`
  - `relay_route_metadata_required_count=1`
  - `relay_route_metadata_valid_count=1`
  - `relay_route_metadata_invalid_count=0`
- direct missing-latency fixture check:
  - `ok=false`
  - `fail_count=3`
  - `relay_route_metadata_required_count=1`
  - `relay_route_metadata_valid_count=0`
  - `relay_route_metadata_invalid_count=1`

## Qualitative Code Audit

No high or medium issue was found in the scoped verifier change.

The change is appropriately fail-closed: records with missing latency,
unverified route identity, weak encryption metadata, invalid timestamp, or
proof/record handshake mismatch cannot satisfy hosted P2P release evidence.
The main residual risk is external, not code-local: live MUSU.PRO evidence is
still missing real logged-in owner-scoped relay route records, release
`quic_relay_tunnel` proof, and payload delivery proof.

## Product Interpretation

This is evidence hardening only. It does not implement release relay tunnel
transport, does not prove second-PC P2P, and does not move execution into
MUSU.PRO.

The product boundary remains:

- MUSU Desktop is the local executor on each device.
- MUSU.PRO receives remote input, hosts project/company rooms, coordinates AI
  meeting-room state, presence, rendezvous, path selection, relay fallback, and
  release evidence.
- Web-assisted connection is allowed for bootstrap and coordination.
- After connection, local programs should prefer direct P2P routes.
- Hosted relay remains fallback-only and must be proven with owner-scoped
  route metadata, transport proof, and delivery proof before it can satisfy
  release gates.

Public release remains No-Go until second-PC route/CPU/matrix evidence, live
MUSU.PRO P2P/relay proof, support mailbox proof, and Store/Partner Center proof
are complete.
