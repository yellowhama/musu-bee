# 2026-06-07 relay tunnel marker conflict gate

## Decision

P2P env status must reject marker-only release relay tunnel flips.

## Change

- `show-musu-pro-p2p-env-status.ps1` now reports:
  - `release_relay_tunnel_runtime_source_contract_ready`
  - `release_relay_tunnel_runtime_missing_source_hooks`
  - `release_payload_preflight_only`
  - `release_payload_endpoint_marker_conflicts_with_preflight_only`
  - `release_relay_tunnel_runtime_marker_conflicts_with_source_contract`
- Release verifier adds:
  - `P2P env status rejects marker-only relay tunnel flips`

## Evidence

Current smoke reports expected No-Go:

- blocker count `12`
- source contract ready `false`
- missing hooks:
  - `rust_source_submit_release_relay_tunnel_payload`
  - `rust_target_accept_release_relay_tunnel_payload`
  - `rust_transport_emits_quic_relay_tunnel_proof`
  - `rust_delivery_records_release_relay_tunnel_payload`
- `/api/v1/relay/payload` is preflight-only
- marker conflicts are false because the release markers remain false

Validation passed with release verifier `case_count=97`, `failed_case_count=0`.

## Product Boundary

MUSU Desktop remains the local executor. MUSU.PRO remains remote input, room,
rendezvous, path selection, relay fallback coordination, and evidence/control
plane. This gate does not implement release relay tunnel transport.
