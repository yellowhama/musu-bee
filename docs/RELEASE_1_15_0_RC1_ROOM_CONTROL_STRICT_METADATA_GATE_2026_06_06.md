# MUSU 1.15.0-rc.1 Room Control Strict Metadata Gate

Date: 2026-06-06

## Summary

Room-scoped MUSU.PRO control-plane endpoints now accept strict metadata only:

- `POST /api/rooms/[roomId]/rendezvous`
- `POST /api/rooms/[roomId]/presence`

These surfaces coordinate project/company room presence, candidate publication,
and web-assisted rendezvous. They are not payload transport endpoints.

## Root Cause

The core P2P rendezvous endpoints were already strict metadata-only, but the
room-scoped rendezvous and presence endpoints still used passthrough request
parsing. That left the project-room control plane less strict than the core P2P
control plane.

The body `room_id` field was also previously tolerated and ignored in room
rendezvous. The canonical room identity should come from the path parameter, so
body `room_id` is now rejected as an unknown field.

## Changed

- `RoomRendezvousSchema` changed from `.passthrough()` to `.strict()`.
- room rendezvous rejects raw payload byte fields before session storage:
  `payload`, `payload_base64`, `payload_b64`, `payload_bytes`,
  `body_base64`.
- room rendezvous raw byte attempts return
  `room_rendezvous_payload_bytes_not_accepted`.
- room rendezvous rejects unknown fields, including body `room_id`, with
  concrete unknown-key paths.
- `CandidateEndpointSchema` in room presence changed to `.strict()`.
- `RoomPresenceSchema` changed from `.passthrough()` to `.strict()`.
- room presence rejects raw payload byte fields before presence storage or
  candidate-cache seeding.
- room presence raw byte attempts return
  `room_presence_payload_bytes_not_accepted`.
- P2P store-forward relay contract audit now gates both room strict metadata
  boundaries.

## Product Boundary

The product boundary is unchanged and now enforced more consistently:

- MUSU Desktop remains the local executor.
- MUSU.PRO remains the remote input, project/company room, presence,
  rendezvous, path-selection, relay-fallback, and evidence control plane.
- Room rendezvous and room presence exchange metadata used to connect local
  programs.
- Work payloads and execution still belong to local MUSU programs or explicitly
  payload-capable room/work-order surfaces, not presence/rendezvous.

## Validation

- room rendezvous route test: `5/5`
- room presence route test: `8/8`
- `npm run test:p2p`: `105/105`
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`,
  `check_count=64`
- release evidence verifier regressions: `ok=true`, `case_count=54`,
  `failed_case_count=0`
- `git diff --check`: pass

## Qualitative Audit

No high or medium issue found.

Room events were intentionally left payload-capable because that endpoint is a
bounded room event stream, not a presence/rendezvous bootstrap surface.
Existing Rust room presence publishing already sends room id in the URL path
and does not require body `room_id`, so this strict boundary matches the local
program client contract.

## Current Release State

Public desktop release remains No-Go. This closes another MUSU.PRO
control-plane input-boundary gap, but it does not close:

- second-PC route/CPU/matrix evidence
- hosted MUSU.PRO production P2P control-plane proof
- release-grade relay tunnel payload transport
- public metadata recheck
- support mailbox proof
- Partner Center / Store proof

## Next Steps

1. Keep room events/work-orders separately bounded as payload-capable room
   surfaces.
2. Implement the distinct `quic_relay_tunnel` release payload path before
   setting `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=true`.
3. Run second-PC route/CPU/matrix evidence on a second Windows machine.
