# 2026-06-05 P2P Store-Forward Queue Status Alignment

`show-musu-pro-p2p-env-status.ps1` now distinguishes implemented
store-forward relay queue fallback source wiring from missing release-grade
tunnel endpoints.

New source status fields:

- `relay_payload_queue_fallback_implemented`
- `relay_payload_queue_fallback_components.policy_marker`
- `relay_payload_queue_fallback_components.web_queue_store_claim_deliver`
- `relay_payload_queue_fallback_components.rust_enqueue_after_lease`
- `relay_payload_queue_fallback_components.rust_target_drain_and_delivery_proof`

Validation reported the queue fallback chain as implemented:

- policy marker: true
- web queue store/claim/deliver: true
- Rust enqueue after lease: true
- Rust target drain and delivery proof: true

Remaining source blockers were renamed to release-specific tunnel blockers:

- `source_release_relay_connect_endpoint_not_implemented`
- `source_release_relay_payload_endpoint_not_implemented`

This does not close hosted P2P release evidence. The queue fallback remains
non-release-grade until production KV/Upstash, release tunnel transport proof,
relay route evidence, and per-record delivery proof are all present.
