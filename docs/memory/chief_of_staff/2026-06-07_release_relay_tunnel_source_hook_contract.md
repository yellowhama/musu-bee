# 2026-06-07 release relay tunnel source hook contract

Rust release relay tunnel source hooks were added without enabling release
runtime markers.

Changed:

- `musu-rs/src/bridge/rendezvous.rs`
  - `release_relay_tunnel_submission_contract()`
  - `submit_release_relay_tunnel_payload(...)`
  - validates `wss://` relay URL and `sha256:` peer fingerprint
  - still returns `release_relay_tunnel_runtime_not_implemented`
- `musu-rs/src/bridge/handlers/relay_payload.rs`
  - `release_relay_tunnel_acceptance_contract()`
  - `accept_release_relay_tunnel_payload(...)`
  - rejects preview store-forward delivery proof
- `scripts/windows/test-release-evidence-verifiers.ps1`
  - source-contract regression:
    `Rust release relay tunnel hook contract is explicit`

Validation:

- parser checks passed
- `cargo fmt --check`
- `cargo test --lib relay_payload`: `26 passed`
- `cargo test --lib rendezvous`: `8 passed`
- `cargo check --lib`
- release verifier: `ok=true`, `case_count=104`, `failed_case_count=0`
- P2P env status:
  `release_relay_tunnel_runtime_source_contract_ready=true`,
  missing hooks `0`, but still `ok=false` with 12 release blockers

Qualitative audit:

- no high/medium issue found
- residual risk is wording/interpretation only: source contract ready is not
  runtime ready
- release remains No-Go until actual `quic_relay_tunnel` runtime, endpoint,
  hosted storage/login, route metadata, transport proof, and payload delivery
  proof exist
