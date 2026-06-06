# MUSU 1.15.0-rc.1 Release Relay Tunnel Source Hook Contract

Date: 2026-06-07

## Summary

Rust source now has explicit release relay tunnel submit/accept hook contracts
without marking the release relay runtime implemented.

This closes the previous source-hook gap in
`show-musu-pro-p2p-env-status.ps1`: the reporter now sees
`release_relay_tunnel_runtime_source_contract_ready=true` and no missing Rust
hook names. It still correctly reports `ok=false` because the actual release
runtime, release payload endpoint, release transport kind, production storage,
runtime login, and live relay route proof remain blocked.

## Code Changes

- `musu-rs/src/bridge/rendezvous.rs`
  - adds `release_relay_tunnel_submission_contract()`
  - adds `submit_release_relay_tunnel_payload(...)`
  - binds release submit metadata to `quic_relay_tunnel`,
    `quic_tls_1_3`, `quic_tls_cert_fingerprint`, and
    `musu_quic_tls_transport`
  - returns `release_relay_tunnel_runtime_not_implemented` after metadata
    validation, so the scaffold cannot be mistaken for payload transit

- `musu-rs/src/bridge/handlers/relay_payload.rs`
  - adds `release_relay_tunnel_acceptance_contract()`
  - adds `accept_release_relay_tunnel_payload(...)`
  - accepts only proof/payload pairs with `transport_kind=quic_relay_tunnel`,
    `release_grade=true`, `relay_default_data_path=false`, `wss://` relay URL,
    and matching session/lease/source/target/tunnel/payload fields
  - rejects preview store-forward delivery proof as non-release-grade

- `scripts/windows/test-release-evidence-verifiers.ps1`
  - adds source-contract regression
    `Rust release relay tunnel hook contract is explicit`

## Validation

- PowerShell parser checks passed.
- `cargo fmt --check` passed.
- `cargo test --lib relay_payload`: `26 passed`.
- `cargo test --lib rendezvous`: `8 passed`.
- `cargo check --lib` passed.
- Release evidence verifier regression passed with `ok=true`,
  `case_count=104`, and `failed_case_count=0`.
- `show-musu-pro-p2p-env-status.ps1 -Json` still reports `ok=false`, with:
  - `release_relay_tunnel_runtime_source_contract_ready=true`
  - `release_relay_tunnel_runtime_missing_source_hooks=[]`
  - `release_relay_tunnel_runtime_implemented=false`
  - `relay_payload_endpoint_implemented=false`
  - `relay_transport_kind=websocket_tunnel`
  - 12 expected source/env/live blockers

## Qualitative Audit

No high or medium issue was found.

The important residual risk is interpretive: "source contract ready" is not
"runtime ready." The gate remains protected because
`RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`, `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`,
`RELAY_TRANSPORT_KIND=websocket_tunnel`, and live MUSU.PRO evidence still lack
runtime login, route metadata, transport proof, and payload delivery proof.

This is source-contract and audit hardening only. It does not implement actual
`quic_relay_tunnel` payload movement.

## Release Interpretation

Public release remains No-Go on:

- second-PC route/CPU/matrix 2/2 evidence
- production MUSU.PRO KV/Upstash storage
- packaged runtime login accepted by `https://musu.pro`
- release payload endpoint
- local `quic_relay_tunnel` runtime
- owner-scoped relay route metadata
- release relay transport proof
- release relay payload delivery proof
- support mailbox proof
- Store/Partner Center proof

## Post-Commit Clean Go/No-Go

After commit `402a5f332808152a3c039438b1aa92411d1a9fbb`, clean go/no-go was
rerun.

Result:

- `ready_for_public_desktop_release=false`
- `manifest_git.dirty=false`
- `local_artifacts_ready=true`
- `public_metadata_ok=true`
- `msix_install_verified=true`
- `single_machine_verified=false`
- `multi_device_verified=false`
- `p2p_control_plane_env_ready=false`
- P2P env blocker count: `12`

This is expected. The Rust source hook contract changes local runtime source,
so previous single-machine/process/single-instance/CPU evidence is no longer
fresh for current HEAD. The next evidence step is to refresh current-HEAD local
runtime evidence before treating local gates as passing again.
