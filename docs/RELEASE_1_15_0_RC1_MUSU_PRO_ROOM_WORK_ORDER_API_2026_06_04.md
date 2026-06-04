# MUSU 1.15.0-rc.1 MUSU.PRO Room Work-Order API

**Wiki ID**: wiki/691
**Date**: 2026-06-04 KST

## Summary

The `musu.pro` web-input/local-executor roadmap now has an explicit room
work-order API:

- `POST /api/rooms/[roomId]/work-orders`

This gives company/project rooms a first-class web input endpoint without
changing the execution boundary. The website accepts the work order, stamps the
room context, and forwards a bounded envelope to the local bridge. The local
MUSU program still executes the work.

## Contract

The route:

- requires a non-empty `roomId`
- requires a non-empty `instruction`
- defaults `channel=company-room`
- defaults `sender_id=musu.pro-room`
- sets `origin=musu.pro`
- takes `room_id` from the route path
- preserves bounded `company_id`, `project_id`, and `work_order_id`
- generates a bounded `work_order_id` when omitted
- normalizes `file://` workspace URIs before forwarding to the local bridge
- returns the `room_id`, `work_order_id`, `origin`, and bridge response

Forwarding target remains the local bridge:

- `${MUSU_BRIDGE_URL}/api/tasks/delegate`

This does not create cloud-side shell/file/browser execution and does not make
`musu.pro` the default data path.

## Validation

Passed:

- `npm run test:routes`
  - `18/18`
  - includes `src/app/api/rooms/[[]roomId[]]/work-orders/route.test.ts`
- `npx tsx --test "src/app/api/rooms/[[]roomId[]]/work-orders/route.test.ts"`
  - `4/4`
- `npm run typecheck`
- `npm run build`
  - production route table includes `/api/rooms/[roomId]/work-orders`
- `git diff --check`

## Release Impact

This is web runtime source. Fresh packaged primary evidence is required after
commit before the current HEAD can claim current-source MSIX/smoke/CPU gates.

Public release remains No-Go until second-PC runtime/multi-device evidence,
hosted owner-scoped `musu.pro` P2P relay proof, support mailbox evidence, and
Store evidence are complete.
