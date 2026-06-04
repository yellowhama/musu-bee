# 2026-06-04 Room Event API

- Added `POST /api/rooms/[roomId]/events` and
  `GET /api/rooms/[roomId]/events`.
- The endpoint requires P2P control bearer auth and stores owner-scoped
  `musu.room_event.v1` events.
- Event types: `presence`, `status`, `message`, `decision`, `work_order`,
  `rendezvous`, `route`, and `error`.
- The store preserves bounded room/company/project/work-order/source
  node/source agent context and bounded payload/message data.
- Production storage fails closed without Vercel KV / Upstash or explicit
  `MUSU_ROOM_EVENT_STORE_PATH`.
- Validation passed: direct room event route test `5/5`, `npm run test:p2p`
  `70/70`, `npm run test:routes` `18/18`, `npm run typecheck`,
  `npm run build`, and `git diff --check`.
- This is web runtime source, so fresh packaged primary evidence is required
  after commit.
