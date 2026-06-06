# Next Steps After Relay Payload Delivery Proof Release Metadata

## Current State

Delivery proof now distinguishes preview queue records from release relay
tunnel delivery proof. Preview store-forward payloads can still be claimed and
marked delivered, but they emit `release_grade=false` and
`transport_kind=http_store_forward_preview`, so they cannot satisfy the hosted
P2P release gate.

## Next Actions

1. Keep `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false` until a real release tunnel
   payload endpoint moves bytes.
2. Implement release tunnel payload transport that emits:
   - `transport_kind=quic_relay_tunnel`
   - `release_grade=true`
   - `relay_default_data_path=false`
   - `relay_url=wss://...`
   - matching transport proof and delivery proof
3. Wire runtime route evidence submission so target-side delivery proof and
   route transport proof are attached to the same session/lease/source/target/
   tunnel chain.
4. Configure production KV/Upstash and record live owner-scoped
   `https://musu.pro` P2P evidence.
5. Run second-PC release evidence:
   - successful route evidence
   - desktop-open idle CPU
   - full runtime CPU scenario matrix
6. Record support mailbox and Store evidence.

## Non-Goals

- Do not count preview queue delivery as release relay tunnel proof.
- Do not mark `websocket_tunnel` or `http_store_forward_preview` as release
  transport.
- Do not move local task execution into MUSU.PRO.
