# 2026-06-06 relay payload delivery proof release metadata

Decision/update:

- `musu.relay_payload_delivery_proof.v1` now includes:
  - `relay_url`
  - `transport_kind`
  - `relay_default_data_path`
  - `release_grade`
- Route evidence release grading now rejects preview delivery proof:
  - non-`quic_relay_tunnel` proof transport kind
  - proof `release_grade=false`
  - mismatched relay URL
  - stored payload `release_grade=false`
  - stored payload non-release transport kind
- Rust bridge/cloud DTOs carry the same fields.
- Hosted P2P verifier rejects preview payload delivery proof transport.

Validation:

- P2P targeted tests: `105/105`
- `npm run typecheck`: pass
- `cargo fmt --check`: pass
- `cargo check --lib`: pass
- `cargo test --lib route_evidence`: `14 passed`
- `cargo test --lib relay_payload`: `24 passed`
- P2P store-forward relay audit: `ok=true`, `fail_count=0`
- release evidence verifier regressions: `ok=true`, `case_count=64`,
  `failed_case_count=0`
- `git diff --check`: pass

Qualitative assessment:

- No high/medium issue found.
- This is release proof-boundary hardening.
- It does not implement the missing release relay tunnel payload endpoint.
- Public release remains No-Go on second-PC route/CPU/matrix evidence, hosted
  P2P proof, support mailbox, and Store evidence.
