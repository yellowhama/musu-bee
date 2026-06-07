# Release 1.15.0-rc.1 Relay Tunnel Not-Implemented Branch Marker Guard

Date: 2026-06-07

## Summary

P2P env status now detects the active Rust
`release_relay_tunnel_runtime_not_implemented` branch as part of the release
relay tunnel runtime marker contract.

This closes a source-gate gap found during the current MUSU.PRO P2P env
recheck: Rust release tunnel submit/accept source hooks exist, so
`release_relay_tunnel_runtime_source_contract_ready=true`, but the local
runtime still returns the fail-closed not-implemented error instead of moving
payload bytes. A future marker-only flip to
`RELAY_TUNNEL_RUNTIME_IMPLEMENTED=true` must not pass just because the hook
names exist.

## Changed

- `scripts\windows\show-musu-pro-p2p-env-status.ps1`
  - adds
    `release_relay_tunnel_runtime_not_implemented_branch_active`;
  - detects `Err(RELEASE_RELAY_TUNNEL_NOT_IMPLEMENTED)` and
    `release_relay_tunnel_runtime_not_implemented` in the Rust rendezvous
    source;
  - treats an active not-implemented branch as a conflict if
    `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=true`;
  - updates next-step text to require removing the not-implemented branch and
    emitting real `quic_relay_tunnel` / `quic_tls_1_3` proof from the byte
    path before the marker can be set.
- `scripts\windows\test-release-evidence-verifiers.ps1`
  - adds regression coverage for the not-implemented branch guard and next-step
    wording.

No release marker was flipped. This is guard hardening only.

## Current Status

Current P2P env status remains the expected No-Go:

- `ok=false`
- blocker count `11`
- `release_relay_tunnel_runtime_implemented=false`
- `release_relay_tunnel_runtime_source_contract_ready=true`
- `release_relay_tunnel_runtime_not_implemented_branch_active=true`
- `release_relay_tunnel_runtime_marker_conflicts_with_source_contract=false`
  because the runtime marker is still correctly false

Current blockers:

- `source_release_relay_payload_endpoint_not_implemented`
- `source_release_relay_tunnel_runtime_not_implemented`
- `source_preview_store_forward_payload_queue_non_release_grade`
- missing KV/Upstash REST URL
- missing KV/Upstash REST token
- `live_evidence_p2p_runtime_not_logged_in`
- `live_evidence_relay_transport_not_wired`
- `live_evidence_relay_route_not_proven`
- `live_evidence_relay_route_metadata_missing`
- `live_evidence_relay_route_transport_proof_missing`
- `live_evidence_relay_payload_delivery_proof_missing`

## Product Boundary

The product boundary is unchanged:

- MUSU.PRO is remote input, project/company room, rendezvous, path selection,
  relay fallback, and evidence/control plane.
- MUSU Desktop is the local executor on each device.
- Release relay readiness requires the local runtime to move real payload bytes
  through the release relay tunnel and produce transport/delivery proof.

## Verification

Passed:

- `git diff --check`
- `scripts\windows\show-musu-pro-p2p-env-status.ps1 -BaseUrl https://musu.pro -Version (Get-Content VERSION -Raw).Trim() -Json`
  produced expected `ok=false`, blocker count `11`, and
  `release_relay_tunnel_runtime_not_implemented_branch_active=true`
- `scripts\windows\test-release-evidence-verifiers.ps1 -Json`:
  `ok=true`, `case_count=105`, `failed_case_count=0`
- `scripts\windows\audit-p2p-store-forward-relay-contract.ps1 -Json -FailOnProblem`:
  `ok=true`, `fail_count=0`

## Qualitative Audit

No high or medium issue found in the change.

Assessment:

- The added guard is conservative and fail-closed.
- The source contract now distinguishes hook presence from runtime execution.
- It does not relax any release gate or make preview store-forward delivery
  release-grade.
- A future implementation must remove the not-implemented branch, move bytes
  through the local release relay tunnel, and emit live owner-scoped route,
  transport, and payload delivery proof before release readiness can pass.

## Next Steps

1. Implement the release payload endpoint beyond metadata preflight.
2. Implement the local `quic_relay_tunnel` runtime byte path.
3. Remove the Rust `release_relay_tunnel_runtime_not_implemented` branch only
   after the byte path exists.
4. Emit `quic_tls_1_3` transport proof and payload delivery proof from the real
   runtime path.
5. Record live MUSU.PRO route metadata, transport proof, and payload delivery
   proof, then capture second-machine route/CPU/matrix evidence.
