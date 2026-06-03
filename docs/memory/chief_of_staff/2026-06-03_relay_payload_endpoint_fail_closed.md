# 2026-06-03 Relay Payload Endpoint Fail-Closed

Decision:

- Relay transport readiness must not be closed by env configuration alone.
- `relayTransportWired()` now requires both `MUSU_P2P_RELAY_TRANSPORT_WIRED=1`
  and `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=true`.
- Current source keeps `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false` because
  `/api/v1/relay/connect` payload transport is not implemented.

Code impact:

- `GET /api/v1/p2p/relay/transport` reports
  `relay_payload_endpoint_wired=false`.
- Relay transport preflight and lease policy add
  `relay_payload_endpoint_not_wired`.
- `POST /api/v1/p2p/relay/lease` denies env-only fallback leases.
- Relay route evidence adds `relay_route_transport_not_wired` and
  `relay_route_payload_endpoint_not_wired`, so proof-shaped JSON plus a stored
  lease cannot become release-grade while the payload endpoint is absent.

Validation:

- `npm run test:p2p` passed 35/35.
- `npm run typecheck` passed.
- `scripts\windows\test-release-evidence-verifiers.ps1 -Json` passed 22/22.

Release interpretation:

- This is fail-closed hardening, not relay payload transport implementation.
- Public release remains No-Go on second-PC runtime/multi-device evidence,
  hosted relay payload proof, support mailbox evidence, and Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_PAYLOAD_ENDPOINT_FAIL_CLOSED_2026_06_03.md`
