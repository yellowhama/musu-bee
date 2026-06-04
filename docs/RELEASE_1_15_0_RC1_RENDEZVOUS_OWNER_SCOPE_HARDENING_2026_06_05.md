# MUSU 1.15.0-rc.1 Rendezvous Owner-Scope Hardening

**Wiki ID**: wiki/713
**Date**: 2026-06-05 KST

## Decision

The roadmap is now explicit on the web/control-plane boundary:

- `https://musu.pro` is the remote input, project room, company meeting room,
  device presence, rendezvous, path-selection, relay-fallback coordination, and
  evidence plane.
- Installed MUSU programs execute work on their own devices.
- `musu.pro` may help devices find each other and exchange route material, but
  it must not become the default execution server or default data path.
- All room, rendezvous, route-candidate, and relay-control state must be scoped
  to the authenticated P2P control owner.

## Root Cause

Rendezvous routes required bearer auth, but the stored rendezvous session did
not include an `owner_key`. Any authorized bearer that knew a session id could
query or mutate that session. The cached node candidate set was also keyed only
by `node_id`, so one owner's node candidate cache could seed another owner's
new rendezvous session if the node id matched.

For the MUSU.PRO room/control-plane model, bearer auth alone is not enough.
The storage record and candidate cache must be owner-scoped.

## Change

Updated `musu-bee/src/lib/p2pRendezvousStore.ts`:

- `StoredP2pRendezvousSession` now carries `owner_key`.
- `createRendezvousSession` requires `owner_key`.
- `getRendezvousSession` and `updateRendezvousSession` require `ownerKey` and
  return `null` when the stored session owner does not match.
- `loadNodeCandidateSet` and `saveNodeCandidateSet` now key cached route
  candidates by owner and node id for both file-store and KV paths.
- Legacy unowned rendezvous sessions fail closed because `isSession` now
  requires `owner_key`.

Updated web control routes:

- `/api/v1/p2p/rendezvous`
- `/api/v1/p2p/rendezvous/[id]`
- `/api/v1/p2p/rendezvous/[id]/candidates`
- `/api/v1/p2p/rendezvous/[id]/approve`
- `/api/v1/p2p/rendezvous/[id]/close`
- `/api/rooms/[roomId]/rendezvous`
- `/api/rooms/[roomId]/presence`

Each route derives `p2pControlPrincipal(req).owner_key` after auth and passes it
into the rendezvous store.

`audit-operator-api-security-contract.ps1` now verifies:

- rendezvous sessions are owner-scoped,
- cross-owner reads/mutations return not found,
- candidate cache keys include owner scope, and
- regression tests cover owner-scoped rendezvous and candidate isolation.

## Validation

- `npm run test:p2p` passed `79/79`
- `npm run test:routes` passed `19/19`
- `npm run typecheck` passed
- `npm run build` passed
- `audit-operator-api-security-contract.ps1 -FailOnProblem -Json` passed:
  `ok=true`, `fail_count=0`
- `git diff --check` passed

New regression tests prove:

- another authorized bearer cannot read a known rendezvous session id,
- another authorized bearer cannot update candidates, approve, or close the
  session,
- same-owner candidate cache still seeds new sessions, and
- another owner does not receive cached candidates for the same node id.

## Release State

This is web runtime source, so the current packaged MSIX/smoke/CPU/matrix
evidence is stale until rebuilt and refreshed from this commit.

Public release remains No-Go until:

- second-PC install/runtime/multi-device evidence is imported,
- hosted MUSU.PRO P2P control-plane proof is live and release-grade,
- relay connect/payload transport is wired with fallback-only policy and
  delivery proof,
- support mailbox evidence is recorded, and
- Store evidence is complete.
