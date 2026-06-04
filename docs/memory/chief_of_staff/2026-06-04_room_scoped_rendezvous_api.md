# 2026-06-04 Room-Scoped Rendezvous API

- Added `POST /api/rooms/[roomId]/rendezvous`.
- The endpoint requires P2P control bearer auth, requires `source_node_id` and
  `target_node_id`, stamps `origin=musu.pro`, and uses `room_id` from the path.
- `StoredP2pRendezvousSession` now preserves bounded
  `company_id`/`project_id`/`room_id`/`work_order_id`/`origin` context.
- The endpoint reuses cached P2P node candidates and the existing path-selection
  order: `lan`, `tailscale`, `direct_quic`, `relay`.
- Validation passed: direct room rendezvous test `3/3`, `npm run test:p2p`
  `65/65`, `npm run test:routes` `18/18`, `npm run typecheck`,
  `npm run build`, and `git diff --check`.
- This is web runtime source, so fresh packaged primary evidence is required
  after commit.
