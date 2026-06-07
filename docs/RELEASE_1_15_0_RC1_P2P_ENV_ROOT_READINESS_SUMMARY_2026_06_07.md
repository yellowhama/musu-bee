# 1.15.0-rc.1 P2P Env Root Readiness Summary

Date: 2026-06-07 16:39 KST

## Scope

`show-musu-pro-p2p-env-status.ps1 -Json` now exposes release relay source and
runtime readiness as root-level summary fields. The same fields still remain
under `source`, but operators and release scripts no longer need to know the
nested shape to see whether the release payload endpoint, tunnel runtime, and
preview queue are actually release-grade.

This is release gate observability hardening only. It does not flip any relay
implementation marker and does not make preview store-forward payloads
release-grade.

## Changed

Updated:

- `scripts\windows\show-musu-pro-p2p-env-status.ps1`
- `scripts\windows\test-release-evidence-verifiers.ps1`

New root JSON fields:

- `relay_payload_queue_fallback_implemented`
- `release_relay_connect_endpoint_implemented`
- `release_relay_payload_endpoint_implemented`
- `release_payload_preflight_endpoint_implemented`
- `release_payload_preflight_only`
- `release_tunnel_payload_endpoint_missing`
- `release_relay_tunnel_runtime_implemented`
- `release_relay_tunnel_runtime_source_contract_ready`
- `release_relay_tunnel_runtime_not_implemented_branch_active`
- `release_relay_tunnel_runtime_missing_source_hooks`
- `release_payload_endpoint_marker_conflicts_with_preflight_only`
- `release_relay_tunnel_runtime_marker_conflicts_with_source_contract`
- `preview_store_forward_payload_queue_non_release_grade`
- `relay_transport_kind`
- `release_grade_relay_transport_kind`
- `release_grade_transport_required`
- `relay_transport_kind_release_grade`

The release verifier source contract now requires the root summary fields so a
future regression cannot hide source/runtime readiness only inside the nested
`source` object.

## Current Status Snapshot

Command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-musu-pro-p2p-env-status.ps1 -BaseUrl https://musu.pro -Version ((Get-Content VERSION -Raw).Trim()) -Json
```

Result summary:

- `ok=false`
- blocker count `11`
- `release_relay_payload_endpoint_implemented=false`
- `release_payload_preflight_endpoint_implemented=true`
- `release_tunnel_payload_endpoint_missing=true`
- `release_relay_tunnel_runtime_implemented=false`
- `release_relay_tunnel_runtime_source_contract_ready=true`
- `release_relay_tunnel_runtime_not_implemented_branch_active=true`
- `release_relay_tunnel_runtime_missing_source_hooks=[]`
- `preview_store_forward_payload_queue_non_release_grade=true`
- `relay_transport_kind=quic_relay_tunnel`
- `relay_transport_kind_release_grade=true`

Current blockers remain:

- `source_release_relay_payload_endpoint_not_implemented`
- `source_release_relay_tunnel_runtime_not_implemented`
- `source_preview_store_forward_payload_queue_non_release_grade`
- `missing_kv_rest_api_url_or_upstash_redis_rest_url`
- `missing_kv_rest_api_token_or_upstash_redis_rest_token`
- `live_evidence_p2p_runtime_not_logged_in`
- `live_evidence_relay_transport_not_wired`
- `live_evidence_relay_route_not_proven`
- `live_evidence_relay_route_metadata_missing`
- `live_evidence_relay_route_transport_proof_missing`
- `live_evidence_relay_payload_delivery_proof_missing`

## Validation

- `git diff --check`
- P2P env status JSON root field smoke: passed
- P2P relay/store-forward contract audit: `ok=true`, `fail_count=0`
- release verifier regression: `ok=true`, `case_count=105`,
  `failed_case_count=0`

## Release Meaning

The source state is now easier to audit:

- release connect preflight exists;
- release payload preflight exists;
- release payload byte transport is still not implemented;
- local release relay tunnel runtime still returns the not-implemented branch;
- preview store-forward payload queue remains non-release-grade;
- relay transport kind metadata is aligned to `quic_relay_tunnel`, but the
  actual byte path and `quic_tls_1_3` transport proof are still missing.

Public release remains No-Go until second-PC route/CPU/matrix evidence, live
MUSU.PRO route metadata, relay transport proof, relay payload delivery proof,
support mailbox proof, and Store/Partner Center proof pass.
