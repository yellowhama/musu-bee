# 2026-06-04 MUSU.PRO Room Work-Order API

Added `POST /api/rooms/[roomId]/work-orders` as the explicit web room input
endpoint for the local-executor roadmap.

Contract:

- `room_id` comes from the path
- `origin=musu.pro`
- default `channel=company-room`
- default `sender_id=musu.pro-room`
- bounded `company_id`, `project_id`, and `work_order_id`
- generated `work_order_id` when omitted
- forwards to local bridge `/api/tasks/delegate`

Validation:

- `npm run test:routes` passed `18/18`
- direct escaped room route test passed `4/4`
- `npm run typecheck` passed
- `npm run build` passed
- `git diff --check` passed

Release note: this is web runtime source, so packaged primary evidence is stale
until rebuilt/refreshed after commit.
