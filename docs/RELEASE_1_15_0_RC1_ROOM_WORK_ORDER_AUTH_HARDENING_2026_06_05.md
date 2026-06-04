# MUSU 1.15.0-rc.1 Room Work-Order Auth Hardening

**Wiki ID**: wiki/711
**Date**: 2026-06-05
**Status**: Web-input security hardening complete. Packaged primary evidence is
stale until rebuilt/refreshed from this source change.

## Summary

`POST /api/rooms/[roomId]/work-orders` is the web-control-plane entry point
that turns a MUSU.PRO room instruction into a local bridge task. That route now
requires P2P control bearer auth before it can forward anything to the local
bridge.

This preserves the product boundary:

- `musu.pro` can accept authenticated remote user input and room work orders.
- The local MUSU program still performs the work.
- Web input must be owner-scoped before it can reach the local bridge.
- The bridge token remains server-side and is not exposed to the caller.

## Change

- Added `authorizeP2pControl(req)` to
  `musu-bee/src/app/api/rooms/[roomId]/work-orders/route.ts`.
- Missing/invalid bearer auth returns `401 unauthorized` before bridge fetch.
- The response now records `owner_scoped=true`.
- Work-order context values for channel, sender, target node, and adapter type
  now use the same bounded normalization as the room id/work-order context.
- `audit-operator-api-security-contract.ps1` now checks that the room work-order
  route is auth-gated and has an auth regression test.

## Validation

- `npm run test:routes` passed `19/19`.
- `audit-operator-api-security-contract.ps1 -FailOnProblem -Json` passed with
  `ok=true`, `fail_count=0`.
- `npm run typecheck` passed.
- `npm run test:p2p` passed `77/77`.
- `npm run build` passed. The build hit transient TLS socket retries while
  fetching external resources, then compiled and generated all pages
  successfully.
- `git diff --check` passed.

## Release Impact

This is security hardening for the local-program/web-input roadmap. It does not
close the public release gate by itself.

Because this changes web runtime source, current packaged primary evidence must
be rebuilt/refreshed after commit before current-source local artifact readiness
can be claimed again.

Public release remains No-Go on:

- second-PC multi-device evidence
- two-machine runtime idle CPU evidence
- two-machine runtime CPU scenario matrix evidence
- hosted `musu.pro` P2P control-plane and relay proof
- support mailbox delivery evidence
- Microsoft Store evidence

