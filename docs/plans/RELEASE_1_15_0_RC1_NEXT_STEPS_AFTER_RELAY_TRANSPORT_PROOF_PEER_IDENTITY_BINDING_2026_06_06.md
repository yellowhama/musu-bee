# Next Steps After Relay Transport Proof Peer Identity Binding

## Current State

Relay transport proof now binds peer identity material to the same
session/lease/source/target/tunnel proof chain used by route evidence.

This hardens the evidence gate but does not implement the actual release relay
tunnel payload endpoint.

## Next Actions

1. Keep `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false` until bytes transit a real
   release tunnel endpoint.
2. Implement the release tunnel payload path so it can emit:
   - `transport_kind=quic_relay_tunnel`
   - `encryption=quic_tls_1_3`
   - `transport_verified_by=musu_quic_tls_transport`
   - `peer_identity_method=quic_tls_cert_fingerprint`
   - `peer_public_key=sha256:<fingerprint>`
3. Wire runtime submission of `musu.relay_transport_proof.v1` only after real
   payload transit.
4. Attach relay payload delivery proof from the target drain path to route
   evidence.
5. Configure production KV/Upstash and record live `https://musu.pro` proof.
6. Run second-PC release evidence:
   - route evidence
   - desktop-open idle CPU
   - full runtime CPU scenario matrix
7. Record support mailbox and Store evidence.

## Non-Goals

- Do not treat stored preview queue payloads as release relay transport.
- Do not count relay lease control-plane proof without payload transit proof.
- Do not move local task execution into MUSU.PRO.
