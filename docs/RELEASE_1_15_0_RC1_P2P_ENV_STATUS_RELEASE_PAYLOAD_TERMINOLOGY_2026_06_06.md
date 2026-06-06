# MUSU 1.15.0-rc.1 P2P Env Status Release Payload Terminology

**Wiki ID**: wiki/831
**Date**: 2026-06-06

## Summary

`show-musu-pro-p2p-env-status.ps1` now separates three different P2P payload
concepts in operator output:

- release payload preflight exists:
  `release_payload_preflight_endpoint_implemented=true`
- release tunnel payload transport endpoint is still missing:
  `release_tunnel_payload_endpoint_missing=true`
- preview store-forward payload queue is wired but intentionally
  non-release-grade:
  `preview_store_forward_payload_queue_non_release_grade=true`

The legacy `release_payload_endpoint_queue_only` field remains as a
backward-compatible alias for older evidence/readers, but the current status
and next-step text no longer uses it as the primary operator concept.

This is status/audit hardening only. It does not implement release relay tunnel
payload transport and does not make the preview queue release-grade.

## Code Changes

Changed files:

- `scripts\windows\show-musu-pro-p2p-env-status.ps1`
  - adds `release_tunnel_payload_endpoint_missing`
  - adds `preview_store_forward_payload_queue_non_release_grade`
  - keeps `release_payload_endpoint_queue_only` as a legacy alias
  - replaces the ambiguous source blocker with
    `source_preview_store_forward_payload_queue_non_release_grade`
  - updates marker-conflict wording to
    `source_release_relay_payload_marker_conflicts_with_preview_queue_only`
- `scripts\windows\audit-p2p-store-forward-relay-contract.ps1`
  - gates the new status fields and blocker names
- `scripts\windows\test-release-evidence-verifiers.ps1`
  - adds source-contract case:
    `P2P env status separates release payload terminology`

## Current Status Output

`show-musu-pro-p2p-env-status.ps1 -Json` at
`2026-06-06T12:36:08+09:00` still reports `ok=false`, as expected.

Source status:

- `relay_connect_endpoint_implemented=true`
- `relay_payload_endpoint_implemented=false`
- `release_payload_preflight_endpoint_implemented=true`
- `relay_payload_queue_endpoint_implemented=true`
- `release_tunnel_payload_endpoint_missing=true`
- `preview_store_forward_payload_queue_non_release_grade=true`
- `release_payload_endpoint_queue_only=true` as legacy alias
- `relay_payload_queue_fallback_implemented=true`
- `relay_transport_kind=websocket_tunnel`
- `release_grade_relay_transport_kind=quic_relay_tunnel`
- `release_grade_transport_required=quic_tls_1_3`
- `relay_transport_kind_release_grade=false`

Current blockers:

- `source_release_relay_payload_endpoint_not_implemented`
- `source_preview_store_forward_payload_queue_non_release_grade`
- `source_relay_transport_kind_not_release_grade`
- missing KV/Upstash URL/token
- packaged runtime not logged in to live P2P control plane
- live relay transport not wired
- live relay route not proven
- live relay route transport proof missing
- live relay payload delivery proof missing

## Qualitative Evaluation

No high or medium issue was found in this change.

The important quality signal is that the status layer now matches the product
and transport boundary:

- `/api/v1/relay/payload` is a metadata-only release preflight surface while
  `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`.
- `/api/v1/p2p/relay/payload` is the preview store-forward queue fallback.
- The preview queue can help diagnostics and fallback experiments, but cannot
  satisfy release relay tunnel proof.
- Operators now see the missing release tunnel endpoint separately from the
  non-release preview queue, reducing the chance of flipping release markers
  based on queue-only evidence.

Risk is low because the patch changes reporting and source-contract gates only.
No runtime payload path, auth path, route evidence storage, or bridge execution
path was changed.

## Validation

Passed:

- PowerShell parser check for `show-musu-pro-p2p-env-status.ps1`
- PowerShell parser check for `audit-p2p-store-forward-relay-contract.ps1`
- PowerShell parser check for `test-release-evidence-verifiers.ps1`
- `show-musu-pro-p2p-env-status.ps1 -Json`
  - expected `ok=false`
  - new fields present
- `audit-p2p-store-forward-relay-contract.ps1 -Json`
  - `ok=true`
  - `fail_count=0`
- `test-release-evidence-verifiers.ps1 -Json`
  - `ok=true`
  - `case_count=62`
  - `failed_case_count=0`

## Product Spec Impact

The product boundary remains unchanged:

- MUSU Desktop is the local executor on each device.
- MUSU.PRO is remote input, project/company room, presence, rendezvous,
  path-selection, relay-fallback policy, and evidence/control plane.
- MUSU.PRO may help devices connect through web-assisted rendezvous.
- The work still runs on local MUSU programs.
- The preview store-forward queue is not the release relay tunnel.
- Release-grade relay requires a distinct tunnel payload endpoint, release
  transport kind `quic_relay_tunnel`, encryption/proof `quic_tls_1_3`, live
  owner-scoped route transport proof, and relay payload delivery proof.

## Remaining Blockers

Public release remains No-Go on:

- real second-PC multi-device route evidence
- second-PC desktop-open idle CPU evidence
- second-PC full runtime CPU scenario matrix evidence
- production KV/Upstash storage and live MUSU.PRO runtime login proof
- release relay tunnel payload endpoint and proof
- support mailbox evidence
- Microsoft Partner Center / Store evidence

## Next Step Document

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_P2P_ENV_STATUS_RELEASE_PAYLOAD_TERMINOLOGY_2026_06_06.md`
