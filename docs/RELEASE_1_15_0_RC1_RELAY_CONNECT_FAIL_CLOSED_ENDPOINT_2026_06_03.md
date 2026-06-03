# MUSU 1.15.0-rc.1 Relay Connect Fail-Closed Endpoint

Date: 2026-06-03 19:38 KST

## Summary

`/api/v1/relay/connect` now has an explicit fail-closed route instead of being
an opaque missing endpoint. The route returns schema
`musu.relay_connect_unavailable.v1` with HTTP `501`, keeps
`relay_payload_endpoint_wired=false`, keeps `relay_transport_wired=false`, and
does not produce relay route proof or payload transit claims.

This is not relay payload transport implementation. It is a failure-handling
boundary for the known release blocker.

## Code Changes

- Added `musu-bee/src/app/api/v1/relay/connect/route.ts`.
- Added `musu-bee/src/app/api/v1/relay/connect/route.test.ts`.
- Added the new route test to `npm run test:p2p`.

The route reports:

- `error=relay_payload_transport_not_implemented`
- `relay_connect_path=/api/v1/relay/connect`
- `relay_transport_kind=websocket_tunnel`
- `release_grade_transport_required=quic_tls_1_3`
- `payload_transit_requires_lease=true`
- `relay_default_data_path=false`
- blockers including `relay_payload_endpoint_not_wired`

## Live Diagnosis

Fresh local P2P control-plane evidence was captured under `.local-build`:

- `.local-build\p2p-control-plane\20260603-193609-musu.pro.evidence.json`
- `.local-build\p2p-control-plane\20260603-193609-musu.pro.verification.json`

Verification remains `ok=false` with `fail_count=19`. The live blockers are:

- hosted relay transport is not wired
- relay payload endpoint is not wired
- `MUSU_P2P_RELAY_URL` / relay entitlement are not configured on production
- KV/Upstash release-grade lease storage is not configured
- release-grade relay route evidence count is `0`
- relay payload transport is not proven

GitHub secret-name status shows `MUSU_P2P_CONTROL_TOKEN_SHA256S` is present, but
`KV_REST_API_URL` or `UPSTASH_REDIS_REST_URL` and
`KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_TOKEN` are missing.

## Validation

- `npm run test:p2p` passed `37/37`.
- `npm run typecheck` passed.
- `git diff --check` passed.
- Dev HTTP check: `GET http://127.0.0.1:3000/app` returned `200`.
- Dev HTTP check: `GET http://127.0.0.1:3000/api/v1/relay/connect` returned
  `501` with schema `musu.relay_connect_unavailable.v1`.

## Release Status

Public release remains No-Go. This source change makes the previous packaged
primary evidence historical until a fresh current-HEAD MSIX smoke, desktop-open
CPU, and runtime CPU matrix refresh is captured after commit.

Remaining public release blockers:

- real second-PC runtime and multi-device route evidence
- hosted P2P relay payload proof
- support mailbox evidence for `musu@musu.pro`
- Partner Center / Store evidence
