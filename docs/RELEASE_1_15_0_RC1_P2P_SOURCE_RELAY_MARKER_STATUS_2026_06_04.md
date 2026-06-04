# RELEASE 1.15.0-rc.1 P2P Source Relay Marker Status - 2026-06-04

## Summary

`show-musu-pro-p2p-env-status.ps1` now reports both hosted environment/evidence
state and the local source-code relay implementation markers from
`musu-bee\src\lib\p2pRelayPolicy.ts`.

This separates two different blockers:

- hosted `musu.pro` still needs KV/Upstash production storage,
- current source still marks release relay connect/payload endpoint
  implementation as false.

That distinction matters because setting `MUSU_P2P_RELAY_TRANSPORT_WIRED=1`
or provisioning KV alone cannot make the hosted P2P gate pass while the source
still has the fail-closed `/api/v1/relay/connect` placeholder.

## Current Source Markers

Latest status output now includes:

- `source.checked=true`
- `source.relay_connect_endpoint_implemented=false`
- `source.relay_payload_endpoint_implemented=false`
- `source.relay_payload_queue_endpoint_implemented=true`
- `source.relay_transport_kind=websocket_tunnel`
- `source.release_grade_transport_required=quic_tls_1_3`

New source blockers:

- `source_relay_connect_endpoint_not_implemented`
- `source_relay_payload_endpoint_not_implemented`

## Live Status

`show-musu-pro-p2p-env-status.ps1 -Json` still reports `ok=false`.

Additional live blockers remain:

- missing `KV_REST_API_URL` / `UPSTASH_REDIS_REST_URL`
- missing `KV_REST_API_TOKEN` / `UPSTASH_REDIS_REST_TOKEN`
- `live_evidence_p2p_relay_lease_kv_not_configured`
- `live_evidence_relay_transport_not_wired`
- `live_evidence_relay_route_not_proven`
- `live_evidence_relay_payload_delivery_proof_missing`

## Release Status

This is status/gate hardening only. It does not implement the actual
Connect/Pro fallback relay/tunnel transport.

Public desktop release remains No-Go until:

- real second-PC multi-device evidence is recorded,
- runtime idle CPU and runtime CPU matrix evidence pass on at least two machines,
- release-grade `https://musu.pro` P2P control-plane proof passes,
- `musu@musu.pro` support mailbox delivery is operator-verified, and
- Store/Partner Center evidence is recorded.
