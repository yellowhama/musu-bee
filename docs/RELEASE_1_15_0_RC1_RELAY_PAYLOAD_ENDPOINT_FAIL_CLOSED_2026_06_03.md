# MUSU 1.15.0-rc.1 Relay Payload Endpoint Fail-Closed Hardening

Date: 2026-06-03

## Summary

Relay transport readiness is now blocked on an explicit payload endpoint
implementation state, not just `MUSU_P2P_RELAY_TRANSPORT_WIRED=1`.

The hosted control plane already had a relay transport descriptor, lease policy,
owner-scoped lease storage, and route-evidence proof gates. The remaining gap was
that the descriptor and lease policy could treat the relay transport as wired if
the operator set only the env flag, even though the advertised
`/api/v1/relay/connect` payload endpoint is not implemented in the web app.

This change keeps the system fail-closed until the real relay/tunnel payload
endpoint is implemented.

## Code Changes

- `musu-bee/src/lib/p2pRelayPolicy.ts`
  - Added `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`.
  - Added `relayPayloadEndpointWired()`.
  - Changed `relayTransportWired()` to require both
    `MUSU_P2P_RELAY_TRANSPORT_WIRED=1` and the payload endpoint implementation
    marker.
  - Added blocker `relay_payload_endpoint_not_wired`.

- `musu-bee/src/app/api/v1/p2p/relay/transport/route.ts`
  - Reports `relay_payload_endpoint_wired=false`.
  - Keeps `relay_transport_wired=false` even when env-only relay policy is set.

- `musu-bee/src/app/api/v1/p2p/relay/lease/route.ts`
  - Refuses env-only relay fallback leases with
    `relay_payload_endpoint_not_wired`.
  - Reports `relay_payload_endpoint_wired` on deny/query/error paths.

- `musu-bee/src/app/api/v1/p2p/route-evidence/route.ts`
  - Relay route evidence cannot become release-grade while
    `relayTransportWired()` or `relayPayloadEndpointWired()` is false.
  - Adds blockers `relay_route_transport_not_wired` and
    `relay_route_payload_endpoint_not_wired`.

## Validation

- `npm run test:p2p`: pass, 35/35
- `npm run typecheck`: pass
- `scripts\windows\test-release-evidence-verifiers.ps1 -Json`: pass, 22/22

## Release Interpretation

This does not implement relay/tunnel payload transport.

It prevents an operator or staging env from closing the hosted P2P gate by
setting `MUSU_P2P_RELAY_TRANSPORT_WIRED=1` before a real payload endpoint exists.
Public release remains No-Go until release-grade relay payload transport is
implemented and proven by owner-scoped route evidence, alongside the remaining
second-PC runtime/multi-device, support mailbox, and Store evidence.
