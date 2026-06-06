# 2026-06-06 P2P route record metadata gate

Current release-gate hardening:

- `verify-p2p-control-plane-evidence.ps1` now requires returned relay success
  route records to include release-grade route metadata, not only nested relay
  transport proof.
- Required route metadata includes `candidate_addr`, `handshake_ms`,
  `total_attempt_ms`, verified QUIC/TLS peer identity, `quic_tls_1_3`, and
  `musu_quic_tls_transport`.
- Relay transport proof `handshake_ms` must match route record `handshake_ms`.
- Verifier output now includes:
  - `relay_route_metadata_required_count`
  - `relay_route_metadata_valid_count`
  - `relay_route_metadata_invalid_count`
- Release verifier regression added source-contract coverage plus three
  negative fixtures for missing latency, unverified route identity, and
  proof/record handshake mismatch.

Validation:

- parser checks: pass
- release evidence verifier regression: `ok=true`, `case_count=81`,
  `failed_case_count=0`
- direct valid P2P fixture: metadata `1/1`
- direct missing-latency fixture: `ok=false`, metadata invalid `1`

Qualitative assessment:

- No high or medium issue found in this scoped verifier change.
- This is hosted P2P evidence hardening only.
- It does not close second-PC proof, release relay runtime proof, support
  mailbox proof, or Store proof.
- Product boundary remains MUSU Desktop local executor plus MUSU.PRO remote
  input, room, rendezvous, path-selection, relay-fallback, and evidence
  control plane.
