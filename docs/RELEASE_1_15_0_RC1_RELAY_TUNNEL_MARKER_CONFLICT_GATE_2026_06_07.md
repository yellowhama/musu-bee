# MUSU 1.15.0-rc.1 Relay Tunnel Marker Conflict Gate

**Date**: 2026-06-07 03:51 KST
**Wiki ID**: wiki/917
**Machine**: `HUGH_SECOND`

## Summary

`show-musu-pro-p2p-env-status.ps1` now detects marker-only release relay
tunnel flips.

The current source state is correct No-Go:

- `/api/v1/relay/payload` is release payload preflight only
- release payload bytes are not accepted there
- preview store-forward queue remains non-release-grade
- Rust release relay tunnel submit/accept hooks are not present
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`

The new gate prevents a future false-positive where those markers are flipped
to `true` before the actual release tunnel source exists.

## Changed

Updated `scripts\windows\show-musu-pro-p2p-env-status.ps1`:

- emits `release_relay_tunnel_runtime_source_contract_ready`
- emits `release_relay_tunnel_runtime_missing_source_hooks`
- emits `release_payload_preflight_only`
- emits `release_payload_endpoint_marker_conflicts_with_preflight_only`
- emits `release_relay_tunnel_runtime_marker_conflicts_with_source_contract`
- adds conflict blockers if marker values claim release readiness while the
  source is still preflight-only or missing release tunnel hooks

Updated `scripts\windows\test-release-evidence-verifiers.ps1`:

- added regression
  `P2P env status rejects marker-only relay tunnel flips`

## Current Smoke

`show-musu-pro-p2p-env-status.ps1 -Json` reports:

- `ok=false`
- blocker count remains `12`
- `release_relay_tunnel_runtime_source_contract_ready=false`
- missing source hooks:
  - `rust_source_submit_release_relay_tunnel_payload`
  - `rust_target_accept_release_relay_tunnel_payload`
  - `rust_transport_emits_quic_relay_tunnel_proof`
  - `rust_delivery_records_release_relay_tunnel_payload`
- `release_payload_preflight_only=true`
- marker conflict blockers are currently `false` because the release markers
  are still correctly `false`

## Validation

- PowerShell parser checks passed.
- P2P env status smoke preserved the existing `12` blockers.
- Release evidence verifier regression passed with `ok=true`,
  `case_count=97`, and `failed_case_count=0`.

## Qualitative Audit

No high or medium issue was found in this scoped gate hardening.

This does not implement the release relay tunnel runtime. It reduces release
risk by preventing preflight-only endpoints, preview queues, DTOs, or proof
recorders from being treated as a real `quic_relay_tunnel` payload path.

Public release remains No-Go on second-PC route/CPU/matrix, hosted MUSU.PRO
P2P/relay proof, support mailbox, and Store proof.
