# MUSU 1.15.0-rc.1 Room Presence API

Date: 2026-06-04 19:30 KST

## Summary

Added `POST /api/rooms/[roomId]/presence` and
`GET /api/rooms/[roomId]/presence` so a MUSU.PRO project/company room has a
current owner-scoped presence table, not only an append-only event log.

This is the room-level bridge between remote web input and local executors:
local MUSU programs and attached AI agents can publish current status,
capabilities, active work orders, and route candidates; the room can then show
which nodes are available and create rendezvous sessions without relying on a
manual host:port prompt first.

## Contract

- The route requires P2P control bearer auth for reads and writes.
- `POST` stores owner-scoped `musu.room_presence.v1` records.
- Status values are `online`, `idle`, `busy`, and `offline`.
- Presence preserves bounded room/company/project/source-agent/work-order
  context, node identity, app version, capabilities, public key, relay
  capability, candidate endpoints, origin, `last_seen_at`, and `expires_at`.
- `POST` also seeds the existing P2P rendezvous node candidate cache using the
  submitted presence candidate set.
- `GET` returns current presence in `last_seen_desc` order with owner,
  company/project, node, agent, status, limit, and diagnostic
  `include_expired` filters.
- Storage uses Vercel KV / Upstash when configured; production fails closed
  without KV or explicit `MUSU_ROOM_PRESENCE_STORE_PATH`.

## Validation

- Direct room presence route test passed `6/6`.
- `npm run test:p2p` passed `76/76`.
- `npm run typecheck` passed.
- `npm run build` passed and the route table includes
  `/api/rooms/[roomId]/presence`.
- `git diff --check` passed.

## Release Note

This is web runtime source, so fresh packaged primary evidence is required
after commit before local artifact readiness can be claimed for this source.
Public release remains blocked on second-PC runtime/multi-device evidence,
hosted `musu.pro` P2P control-plane proof, support mailbox evidence, and Store
evidence.
