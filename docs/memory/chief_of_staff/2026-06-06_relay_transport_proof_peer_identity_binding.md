# 2026-06-06 relay transport proof peer identity binding

Decision/update:

- `musu.relay_transport_proof.v1` now includes:
  - `peer_identity_verified`
  - `peer_identity_method`
  - `peer_public_key`
- Web route evidence validation now requires relay transport proof identity to
  match route evidence identity.
- Stored proof matching and release-grade query filtering now include peer
  identity fields.
- Rust `RouteRelayTransportProof`, `P2pRelayTransportProofRequest`, and
  stored proof DTOs carry the same fields.

Validation:

- P2P targeted tests: `105/105`
- `npm run typecheck`: pass
- `cargo check --lib`: pass
- `cargo fmt --check`: pass
- `cargo test --lib route_evidence`: `14 passed`
- P2P store-forward relay audit: `ok=true`, `fail_count=0`
- release verifier regressions: `ok=true`, `case_count=63`,
  `failed_case_count=0`
- `git diff --check`: pass

Qualitative assessment:

- No high/medium issue found.
- This is proof-integrity hardening only.
- Release relay tunnel payload endpoint is still missing.
- Public release remains No-Go on second-PC route/CPU/matrix evidence, hosted
  P2P proof, support mailbox, and Store evidence.
