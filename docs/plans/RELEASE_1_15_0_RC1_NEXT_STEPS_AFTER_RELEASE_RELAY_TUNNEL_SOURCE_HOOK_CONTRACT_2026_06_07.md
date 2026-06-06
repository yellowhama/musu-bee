# Next Steps After Release Relay Tunnel Source Hook Contract

Date: 2026-06-07

Current state:

- Rust release relay tunnel submit/accept hook contracts exist.
- P2P env status reports `release_relay_tunnel_runtime_source_contract_ready=true`.
- Release runtime remains intentionally blocked:
  `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`.
- Release payload endpoint remains blocked:
  `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`.
- Release transport kind remains blocked:
  `RELAY_TRANSPORT_KIND=websocket_tunnel`.

## Next Implementation Steps

0. Refresh current-HEAD local evidence after the Rust runtime source change.
   - Single-machine smoke.
   - Process ownership.
   - Startup single-instance.
   - Desktop single-instance.
   - Runtime idle CPU.
   - Runtime CPU scenario matrix.

1. Implement the real local `quic_relay_tunnel` runtime path.
   - Move payload bytes through the tunnel.
   - Emit `musu.relay_transport_proof.v1`.
   - Bind session, lease, source, target, tunnel id, peer identity, and
     `quic_tls_1_3`.

2. Wire the distinct release payload endpoint.
   - Keep `/api/v1/relay/payload` fail-closed until byte transit is real.
   - Do not reuse the preview store-forward queue as the release endpoint.

3. Flip release markers only after proof exists.
   - `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=true`
   - `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=true`
   - `RELAY_TRANSPORT_KIND=quic_relay_tunnel`

4. Provision and verify hosted MUSU.PRO env.
   - Configure KV/Upstash REST URL and token.
   - Log in packaged MUSU runtime through the WindowsApps alias.
   - Record owner-scoped hosted P2P evidence.

5. Record release-grade relay route evidence.
   - Route metadata count > 0.
   - Relay transport proof valid count > 0.
   - Relay payload delivery proof valid count > 0.

Do not count failed target-route CPU evidence, preview queue delivery, or
source hook presence as release relay proof.
