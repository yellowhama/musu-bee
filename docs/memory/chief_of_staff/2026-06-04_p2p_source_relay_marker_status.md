# 2026-06-04 P2P Source Relay Marker Status

Work completed:

- Updated `scripts\windows\show-musu-pro-p2p-env-status.ps1` to inspect
  `musu-bee\src\lib\p2pRelayPolicy.ts`.
- The status output now has a `source` section with relay connect/payload
  implementation markers and the release-grade transport requirement.
- Added source blockers for the current fail-closed relay transport state:
  `source_relay_connect_endpoint_not_implemented` and
  `source_relay_payload_endpoint_not_implemented`.

Current source state:

- `relay_connect_endpoint_implemented=false`
- `relay_payload_endpoint_implemented=false`
- `relay_payload_queue_endpoint_implemented=true`
- `relay_transport_kind=websocket_tunnel`
- `release_grade_transport_required=quic_tls_1_3`

Validation:

- PowerShell parser check passed.
- `show-musu-pro-p2p-env-status.ps1 -Json` reports the new source markers and
  keeps `ok=false`.

Release interpretation:

- KV/Upstash provisioning is still required, but it is not sufficient.
- The actual Connect/Pro fallback relay/tunnel transport remains unimplemented
  until `/api/v1/relay/connect` stops being a fail-closed placeholder and can
  emit release-grade `quic_tls_1_3` proof.
