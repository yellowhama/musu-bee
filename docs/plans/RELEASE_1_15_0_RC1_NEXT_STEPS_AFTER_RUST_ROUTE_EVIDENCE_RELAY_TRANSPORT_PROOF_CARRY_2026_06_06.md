# Next Steps After Rust Route Evidence Relay Transport Proof Carry

## Current State

Rust route evidence can now preserve relay transport proof when a real release
tunnel produces it. The next work is to produce that proof from actual runtime
transport, not from a fixture or env flag.

## Next Actions

1. Implement real release relay tunnel payload transport.
   - Keep release kind `quic_relay_tunnel`.
   - Keep proof encryption `quic_tls_1_3`.
   - Do not reuse the store-forward queue as release tunnel transport.

2. Generate runtime `RouteRelayTransportProof`.
   - Bind proof to session ID, lease ID, source node, target node, relay URL,
     tunnel ID, bytes transited, verifier, and timestamps.
   - Attach that proof to route evidence before local JSON write and cloud
     submit.

3. Bind payload delivery proof to the same tunnel.
   - Ensure source/target/session/lease/tunnel match the transport proof.
   - Verify hosted route evidence returns nonzero
     `relay_route_transport_proof_valid_count` and
     `relay_payload_delivery_proof_valid_count`.

4. Run hosted MUSU.PRO P2P evidence from the packaged runtime.
   - Use the WindowsApps `musu.exe` login path.
   - Rerun hosted evidence without `-AllowUnverified`.

5. Continue second-PC release kit work.
   - Install the same current build on the second Windows PC.
   - Capture install, route, idle CPU, and runtime CPU matrix evidence.

## Non-Goals

- Do not mark relay release-grade from env/config alone.
- Do not treat localhost dashboard state as installed MUSU Desktop state.
- Do not move execution into MUSU.PRO.

