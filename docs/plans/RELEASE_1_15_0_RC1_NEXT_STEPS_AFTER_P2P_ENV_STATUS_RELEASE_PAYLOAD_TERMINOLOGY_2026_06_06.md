# Next Steps After P2P Env Status Release Payload Terminology

## Current State

The P2P status layer now clearly separates:

- release payload preflight
- missing release tunnel payload endpoint
- preview store-forward payload queue fallback

This removes operator ambiguity but does not close the hosted P2P release gate.

## Next Actions

1. Install the packaged MUSU Desktop runtime on the second Windows PC and run
   the second-PC release kit.
2. Import real second-PC evidence:
   - successful multi-device route proof
   - desktop-open idle CPU
   - full runtime CPU scenario matrix
3. For hosted MUSU.PRO P2P:
   - configure production KV/Upstash URL/token
   - log in the packaged runtime against `https://musu.pro`
   - implement a distinct release tunnel payload endpoint
   - keep `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false` until actual payload bytes
     transit the release tunnel path
   - switch `RELAY_TRANSPORT_KIND` to `quic_relay_tunnel` only with live
     transport proof
4. Record live hosted proof:
   - owner-scoped relay lease storage
   - relay route evidence with bound `relay_transport_proof`
   - relay payload delivery proof
5. Record support mailbox evidence for `musu@musu.pro`.
6. Record Microsoft Partner Center / Store evidence.

## Non-Goals

- Do not use the preview store-forward queue as release tunnel proof.
- Do not count localhost developer dashboard availability as packaged runtime
  health.
- Do not move execution into MUSU.PRO.
- Do not count the HUGH-MAIN timeout diagnostic as successful multi-device
  route evidence.
