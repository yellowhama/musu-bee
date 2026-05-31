# CoS Memory Note — Relay Fallback Lease Policy

Date: 2026-06-01 09:10 KST

Durable decision: `musu.pro` relay must remain an explicit Connect/Pro
fallback, not a silent default data path. The current implementation adds the
control-plane lease boundary before wiring any relay/tunnel data transport.

Implementation facts:

- `POST /api/v1/p2p/relay/lease` validates fallback requests and is fail-closed
  by default.
- Successful relay leases require `MUSU_P2P_RELAY_ENABLED=1`,
  `MUSU_P2P_RELAY_TRANSPORT_WIRED=1`, `MUSU_P2P_RELAY_URL`,
  `MUSU_P2P_RELAY_ENTITLEMENT=connect|pro|enterprise`,
  `direct_path_failed=true`, and at least one non-relay attempted route kind.
- `GET /api/v1/p2p/relay/lease` returns owner-scoped stored lease records.
- Relay lease records use the same token-derived SHA-256 owner boundary as
  route evidence and omit `owner_key` in API responses.
- Lease records explicitly carry `route_kind=relay`,
  `payload_transited_musu_infra=true`, `default_data_path=false`, and
  `policy=connect_pro_fallback_only`.
- `musu-rs/src/cloud/mod.rs` now has relay lease DTOs and
  `request_relay_lease`.
- `musu relay status --json` now exposes
  `relay_control_plane_lease_wired=true`,
  `relay_lease_endpoint=/api/v1/p2p/relay/lease`,
  `relay_default_data_path=false`, and still
  `relay_transport_wired=false`.

Release implication: this improves the `musu.pro` P2P control-plane boundary
and prevents relay from becoming an implicit default later. It does not close
public release readiness: actual relay/tunnel transport, real account
entitlement mapping, QUIC/TLS route proof, real second-PC route evidence,
two-machine CPU evidence, support inbox evidence, and Store evidence remain
open.
