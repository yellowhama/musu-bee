# Release 1.15.0-rc.1 P2P Relay Candidate Protocol Release Kind

Date: 2026-06-07

## Summary

The relay transport descriptor already targets `quic_relay_tunnel`; this update
aligns the candidate-exchange protocol metadata with that same release relay
kind.

Changed implementation:

- Web rendezvous candidate schema accepts `relay_protocol=quic_relay_tunnel`.
- Room presence schema accepts `relay_protocol=quic_relay_tunnel`.
- `normalizeCandidateEndpoints()` preserves `quic_relay_tunnel`.
- Rust cloud DTOs serialize `RelayProtocol::QuicRelayTunnel` as
  `quic_relay_tunnel`.
- `musu room presence publish --relay-url ...` now defaults the relay
  candidate protocol to `quic_relay_tunnel`.
- The CLI still accepts legacy `websocket_tunnel` input for compatibility, but
  the release/default candidate path no longer advertises it.

This is control-plane metadata alignment only. It does not implement release
payload movement through a relay tunnel.

## Boundary

MUSU.PRO may coordinate presence, rendezvous, route candidates, path selection,
relay fallback, and evidence. MUSU Desktop remains the local executor. The web
control plane only receives and preserves the local runtime's connection
candidate metadata; it does not run the user's local tools or move payload bytes
on behalf of the runtime.

Release relay remains blocked until:

- the distinct release relay payload endpoint is implemented;
- the local runtime moves bytes through an actual `quic_relay_tunnel`;
- `quic_tls_1_3` transport proof is emitted by the runtime;
- route metadata, relay transport proof, and payload delivery proof are present
  in live owner-scoped MUSU.PRO evidence;
- production KV/Upstash storage and runtime login are configured and proven.

## Verification

Passed:

- `npm run test:p2p`: 112/112
- `npm run typecheck`
- `cargo test --manifest-path .\musu-rs\Cargo.toml route_peer_from_target_candidates --lib`: 2/2
- `cargo test --manifest-path .\musu-rs\Cargo.toml room_presence --lib`: 5/5
- `scripts\windows\audit-p2p-store-forward-relay-contract.ps1 -Json`:
  `ok=true`, `fail_count=0`
- `scripts\windows\test-release-evidence-verifiers.ps1 -Json`: `ok=true`,
  `case_count=105`, `failed_case_count=0`
- `scripts\windows\show-musu-pro-p2p-env-status.ps1 -Json`: expected
  `ok=false` with the release runtime and live proof blockers still present
- `git diff --check`

Current P2P env status still blocks on:

- `source_release_relay_payload_endpoint_not_implemented`
- `source_release_relay_tunnel_runtime_not_implemented`
- `source_preview_store_forward_payload_queue_non_release_grade`
- missing KV/Upstash URL/token
- `live_evidence_p2p_runtime_not_logged_in`
- `live_evidence_relay_transport_not_wired`
- `live_evidence_relay_route_not_proven`
- missing route metadata, transport proof, and payload delivery proof

## Qualitative Audit

No high or medium issue found in this change.

Assessment:

- The change is narrow and consistent with the current P2P release contract.
- The risky part is semantic: `relay_protocol=quic_relay_tunnel` could be
  mistaken for runtime readiness. The release gates still prevent that by
  keeping `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false` and
  `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`.
- The audit script and release verifier regression now include a source
  contract that checks web schemas, Rust DTOs, and CLI defaults all preserve the
  release relay candidate protocol.

## Next Steps

1. Implement the release relay payload endpoint.
2. Implement the local `quic_relay_tunnel` runtime byte path.
3. Emit MUSU-bound `quic_tls_1_3` transport proof.
4. Record live owner-scoped MUSU.PRO relay route metadata, relay transport
   proof, and payload delivery proof.
5. Capture real two-machine route/CPU/matrix evidence.
