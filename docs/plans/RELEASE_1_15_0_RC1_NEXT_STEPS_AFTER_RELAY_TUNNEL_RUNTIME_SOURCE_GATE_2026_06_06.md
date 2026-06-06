# Next Steps After Relay Tunnel Runtime Source Gate

## Current State

The source gate now explicitly blocks release relay readiness until the local
runtime has a real release tunnel implementation:

- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- `RELAY_TRANSPORT_KIND=websocket_tunnel`
- preview store-forward queue remains non-release-grade

## Next Actions

1. Add a local runtime relay tunnel module that owns actual payload byte
   transport over the release relay path.
2. Make the release tunnel produce `musu.relay_transport_proof.v1` with
   `transport_kind=quic_relay_tunnel`, `encryption=quic_tls_1_3`,
   `payload_transited_musu_infra=true`, and peer identity fingerprint proof.
3. Add a distinct release payload endpoint that is not the preview
   `/api/v1/p2p/relay/payload` store-forward queue.
4. Keep `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false` and
   `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false` until real payload transit proof
   exists.
5. Rerun hosted P2P evidence and require route transport proof and payload
   delivery proof counts greater than zero.

## Non-Goals

- Do not flip policy constants to pass release gates without runtime proof.
- Do not treat the preview queue as release tunnel payload transport.
- Do not move execution from local MUSU Desktop into MUSU.PRO.
