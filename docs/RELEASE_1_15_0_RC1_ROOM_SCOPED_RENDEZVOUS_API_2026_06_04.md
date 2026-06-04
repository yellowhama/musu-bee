# MUSU 1.15.0-rc.1 Room-Scoped Rendezvous API

Date: 2026-06-04 18:28 KST

## Summary

Added a room-scoped P2P rendezvous entry point:

- `POST /api/rooms/[roomId]/rendezvous`

This moves the `musu.pro` product shape closer to the intended control-plane:
project/company rooms can now initiate a P2P rendezvous session between two
local MUSU nodes without making `musu.pro` the execution server or default data
path.

## Contract

The route:

- requires a non-empty `roomId`
- requires P2P control bearer auth
- requires `source_node_id` and `target_node_id`
- accepts optional `requested_capability`, `company_id`, `project_id`, and
  `work_order_id`
- stamps `origin=musu.pro`
- uses `room_id` from the path, not from the request body
- loads cached candidate sets for both nodes from the existing P2P rendezvous
  store
- creates a normal `musu.p2p_rendezvous_store.v1` session with the established
  path-selection order: `lan`, `tailscale`, `direct_quic`, `relay`

`StoredP2pRendezvousSession` now preserves bounded context:

- `company_id`
- `project_id`
- `room_id`
- `work_order_id`
- `origin`

## Product Boundary

This keeps the boundary explicit:

- `musu.pro` coordinates room context, candidate exchange, and path selection
- local MUSU programs execute work and own local resources
- direct P2P paths remain preferred
- relay remains fallback after direct-path failure and the Connect/Pro boundary

The route does not execute shell/file/browser work in the cloud.

## Validation

Passed:

- direct room rendezvous test: `3/3`
- `npm run test:p2p`: `65/65`
- `npm run test:routes`: `18/18`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

The production build route table includes:

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
