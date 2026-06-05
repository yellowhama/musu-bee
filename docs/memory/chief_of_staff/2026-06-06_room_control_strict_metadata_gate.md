# 2026-06-06 Room Control Strict Metadata Gate

Room-scoped MUSU.PRO control-plane endpoints now accept strict metadata only:

- `POST /api/rooms/[roomId]/rendezvous`
- `POST /api/rooms/[roomId]/presence`

Changed:

- strict `RoomRendezvousSchema`
- strict room presence `CandidateEndpointSchema`
- strict `RoomPresenceSchema`
- raw payload fields rejected before room rendezvous session storage:
  `payload`, `payload_base64`, `payload_b64`, `payload_bytes`, `body_base64`
- raw payload fields rejected before room presence storage/candidate-cache
  seeding
- body `room_id` is rejected; path `roomId` remains canonical
- new error codes:
  - `room_rendezvous_payload_bytes_not_accepted`
  - `room_presence_payload_bytes_not_accepted`
- P2P store-forward relay contract audit gates these room metadata boundaries

Validation:

- room rendezvous route test: `5/5`
- room presence route test: `8/8`
- `npm run test:p2p`: `105/105`
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`,
  `check_count=64`
- release verifier regressions: `54/54`
- `git diff --check`: pass

Product boundary:

- MUSU Desktop remains local executor.
- MUSU.PRO remains remote input, project/company room, presence, rendezvous,
  path-selection, relay-fallback, and evidence control plane.
- Presence/rendezvous do not transport payload bytes.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_ROOM_CONTROL_STRICT_METADATA_GATE_2026_06_06.md`
