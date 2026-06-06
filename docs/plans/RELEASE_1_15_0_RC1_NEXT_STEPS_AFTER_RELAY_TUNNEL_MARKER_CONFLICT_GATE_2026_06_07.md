# MUSU 1.15.0-rc.1 Next Steps After Relay Tunnel Marker Conflict Gate

**Generated**: 2026-06-07 03:53 KST
**Related report**:
`docs\RELEASE_1_15_0_RC1_RELAY_TUNNEL_MARKER_CONFLICT_GATE_2026_06_07.md`

## Current Position

The release gate now rejects marker-only relay tunnel readiness. Current source
is still correct No-Go:

- `/api/v1/relay/payload` is preflight-only
- release payload bytes are not accepted
- preview store-forward queue is non-release-grade
- release relay tunnel runtime hooks are missing
- release markers remain false

## Execution Order

1. Keep `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false` and
   `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false` until the source hooks below exist.
2. Add source-side Rust release tunnel submit hook:
   `rust_source_submit_release_relay_tunnel_payload`.
3. Add target-side Rust release tunnel accept hook:
   `rust_target_accept_release_relay_tunnel_payload`.
4. Emit `quic_relay_tunnel` transport proof bound to `quic_tls_1_3`,
   session, lease, source, target, tunnel id, and peer identity.
5. Record release-grade payload delivery proof only after bytes transit MUSU
   relay infrastructure.
6. Replace `/api/v1/relay/payload` preflight-only responses with actual release
   tunnel acceptance only after the runtime hooks and proof path are verified.
7. Then flip `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=true`.
8. Then flip `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=true`.
9. Re-run P2P env status, release verifier, hosted P2P evidence, and go/no-go.

## Acceptance Criteria

- `show-musu-pro-p2p-env-status.ps1 -Json` reports
  `release_relay_tunnel_runtime_source_contract_ready=true`.
- `release_relay_tunnel_runtime_missing_source_hooks` is empty.
- `release_payload_preflight_only=false`.
- marker conflict fields remain false after markers are true.
- Hosted P2P evidence has owner-scoped relay route records with route metadata,
  relay transport proof, and relay payload delivery proof.
- Go/no-go no longer includes source relay tunnel blocker names.

## Non-Goals

- Do not use the preview store-forward queue as the release tunnel.
- Do not route local execution into MUSU.PRO.
- Do not flip release markers as a substitute for runtime proof.
