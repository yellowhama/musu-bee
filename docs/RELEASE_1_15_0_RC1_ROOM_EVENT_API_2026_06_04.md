# MUSU 1.15.0-rc.1 Room Event API

Date: 2026-06-04 19:05 KST

## Summary

Added a room-scoped event log for MUSU.PRO project/company rooms:

- `POST /api/rooms/[roomId]/events`
- `GET /api/rooms/[roomId]/events`

This gives the `musu.pro` room a concrete meeting-room coordination surface:
local MUSU programs and attached AI agents can publish bounded room events and
read the room event log while actual work still executes on each local device.

## Contract

The route:

- requires a non-empty path `roomId`
- requires P2P control bearer auth for both reads and writes
- records owner-scoped events under `musu.room_event.v1`
- supports event types `presence`, `status`, `message`, `decision`,
  `work_order`, `rendezvous`, `route`, and `error`
- preserves bounded `company_id`, `project_id`, `work_order_id`,
  `source_node_id`, `source_agent_id`, `message`, `payload`, and `origin`
- returns room events in `newest_first` order
- filters reads by event type, company/project/work-order, source node/agent,
  and `since`
- stores through Vercel KV / Upstash when configured, and otherwise requires
  `MUSU_ROOM_EVENT_STORE_PATH` in production to avoid silent ephemeral storage

## Product Boundary

This moves the roadmap toward the intended structure:

- `musu.pro` hosts the project room, meeting context, status log, work-order
  envelope, rendezvous, path selection, and evidence plane
- local MUSU programs execute work on each device
- room events do not execute shell/file/browser work in the cloud
- event payloads are bounded before storage

## Validation

Passed:

- direct room event route test: `5/5`
- `npm run test:p2p`: `70/70`
- `npm run test:routes`: `18/18`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

The production build route table includes:

- `/api/rooms/[roomId]/events`
- `/api/rooms/[roomId]/rendezvous`
- `/api/rooms/[roomId]/work-orders`

## Release Impact

This is web runtime source. Current packaged primary evidence is stale after
this commit until the local-sideload MSIX, single-machine smoke, desktop-open
CPU, and runtime CPU scenario matrix are refreshed for the new HEAD.

Public release remains No-Go until second-PC multi-device evidence, second-PC
runtime CPU evidence, second-PC runtime CPU matrix evidence, hosted `musu.pro`
P2P control-plane proof, support mailbox proof, and Store evidence are
recorded.
