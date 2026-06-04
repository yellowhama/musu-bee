# 2026-06-04 Room Presence API

- Added `POST /api/rooms/[roomId]/presence` and
  `GET /api/rooms/[roomId]/presence`.
- Presence records are owner-scoped `musu.room_presence.v1` records with
  bounded node, company/project, source-agent, active work-order, capability,
  candidate endpoint, relay, public-key, origin, and expiry fields.
- `POST` seeds `saveNodeCandidateSet(...)`, so room presence becomes direct
  input to room-scoped rendezvous path selection.
- Production storage fails closed without Vercel KV / Upstash or explicit
  `MUSU_ROOM_PRESENCE_STORE_PATH`.
- Validation passed: direct room presence route test `6/6`, `npm run test:p2p`
  `76/76`, `npm run typecheck`, `npm run build`, and `git diff --check`.
- This is web runtime source, so fresh packaged primary evidence is required
  after commit.
