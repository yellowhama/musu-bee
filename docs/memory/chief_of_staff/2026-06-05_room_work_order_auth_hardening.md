# 2026-06-05 Room Work-Order Auth Hardening

Closed a web-input security gap on `POST /api/rooms/[roomId]/work-orders`.

Before this change, the room work-order route could forward a MUSU.PRO room
instruction to the local bridge without first requiring P2P control auth. The
route now calls `authorizeP2pControl(req)` before parsing/forwarding the work
order. Missing auth returns `401 unauthorized`, and the local bridge is not
called.

Files changed:

- `musu-bee/src/app/api/rooms/[roomId]/work-orders/route.ts`
- `musu-bee/src/app/api/rooms/[roomId]/work-orders/route.test.ts`
- `scripts/windows/audit-operator-api-security-contract.ps1`

Validation:

- `npm run test:routes`: `19/19`
- operator API security audit: `ok=true`, `fail_count=0`
- `npm run typecheck`
- `npm run test:p2p`: `77/77`
- `npm run build`
- `git diff --check`

Interpretation: this makes the MUSU.PRO remote-input path owner-scoped before
it can reach a local executor. It is web runtime source, so packaged evidence is
stale until rebuilt/refreshed after commit.

