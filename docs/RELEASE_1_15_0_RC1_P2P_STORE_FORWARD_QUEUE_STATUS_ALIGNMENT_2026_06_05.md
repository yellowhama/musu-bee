# MUSU 1.15.0-rc.1 P2P Store-Forward Queue Status Alignment

**Wiki ID**: wiki/719
**Date**: 2026-06-05 KST

## Scope

`show-musu-pro-p2p-env-status.ps1` now separates two different relay states:

- store-forward relay payload queue fallback source wiring,
- release-grade Connect/Pro tunnel endpoint implementation.

This matters because the source already has a lease-bound payload queue path:
failed direct route -> relay lease -> payload queue -> target claim/drain ->
local task acceptance -> delivery proof route evidence.

That queue fallback remains non-release-grade until a real QUIC/TLS relay tunnel
or equivalent release transport proof exists.

## Change

The status script now reports:

- `source.relay_payload_queue_fallback_implemented`
- `source.relay_payload_queue_fallback_components.policy_marker`
- `source.relay_payload_queue_fallback_components.web_queue_store_claim_deliver`
- `source.relay_payload_queue_fallback_components.rust_enqueue_after_lease`
- `source.relay_payload_queue_fallback_components.rust_target_drain_and_delivery_proof`

It also renames the generic source endpoint blockers to release-specific
blockers:

- `source_release_relay_connect_endpoint_not_implemented`
- `source_release_relay_payload_endpoint_not_implemented`

This prevents the status report from implying that the queue fallback is absent,
while still making clear that `/api/v1/relay/connect` remains a fail-closed
release tunnel placeholder.

## Validation

PowerShell parser:

- `show-musu-pro-p2p-env-status.ps1`: passed

Source status:

- `relay_payload_queue_fallback_implemented=true`
- `policy_marker=true`
- `web_queue_store_claim_deliver=true`
- `rust_enqueue_after_lease=true`
- `rust_target_drain_and_delivery_proof=true`
- release connect endpoint implemented: `false`
- release payload endpoint implemented: `false`

With GitHub checks skipped for local source validation, blockers are now:

- `source_release_relay_connect_endpoint_not_implemented`
- `source_release_relay_payload_endpoint_not_implemented`
- `live_evidence_p2p_relay_lease_kv_not_configured`
- `live_evidence_relay_transport_not_wired`
- `live_evidence_relay_route_not_proven`
- `live_evidence_relay_payload_delivery_proof_missing`

## Release Status

This is status/evidence alignment only. It does not make the queue fallback
release-grade and does not close hosted P2P release evidence.

Public release still requires:

- production KV/Upstash relay lease/payload storage,
- release-grade relay tunnel/connect payload transport proof,
- owner-scoped relay route evidence with `route_kind=relay`,
  `payload_transited_musu_infra=true`, and `release_grade=true`,
- per-record relay payload delivery proof in returned relay route evidence,
- second-PC route/CPU/matrix evidence,
- support mailbox evidence, and
- Store evidence.
